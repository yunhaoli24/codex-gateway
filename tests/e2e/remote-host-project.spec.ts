import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { AGENT_OUTPUT_TIMEOUT_MS } from "./helpers/timeouts";
import { z } from "zod";
import { expect, test } from "./fixtures/remote-workspace";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { projectRecordSchema } from "./helpers/http-schemas";
import { STALE_THREAD_CURSOR_ERROR_CODE } from "../../shared/gateway-errors";
import { sendRealtimeRawRequest } from "./helpers/realtime";
import { chatViewportBottomDistance } from "./helpers/scroll";
import {
  activeRealtimeSocketCount,
  installRealtimeSocketProbe,
  realtimeClientMessageCount,
  waitForRealtimeClientMessage,
} from "./helpers/realtime-socket-probe";
import {
  execRemoteSsh,
  type RemoteCodexEnv,
  selectSidebarThread,
  sendTextTurn,
  waitForSelectedThreadId,
} from "./helpers/remote-codex";

test("new threads display and inherit the remote Codex defaults", async ({
  page,
  remoteWorkspace,
}) => {
  await installRealtimeSocketProbe(page);
  await openApp(page);
  const { remote } = remoteWorkspace;
  const config = await execRemoteSsh(
    remote,
    `awk -F ' *= *' '/^model = / { gsub(/"/, "", $2); print "model=" $2 } /^model_reasoning_effort = / { gsub(/"/, "", $2); print "effort=" $2 }' "\${CODEX_HOME:-$HOME/.codex}/config.toml"`,
  );
  const parsedConfig: Record<string, string> = {};
  for (const line of config.stdout.trim().split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    parsedConfig[line.slice(0, separator)] = line.slice(separator + 1);
  }
  const configured = z
    .object({ model: z.string().min(1), effort: z.string().min(1) })
    .parse(parsedConfig);

  const { project } = await remoteWorkspace.provision({
    hostName: `remote-defaults-${Date.now()}`,
  });
  await page.getByTestId(`project-button-${project.id}`).click();

  const picker = page.getByTestId("model-select");
  await expect(picker).not.toContainText(/主机默认|Codex 默认/);
  await expect(picker).toContainText(effortDisplayLabel(configured.effort));
  await picker.click();
  const configuredModelOption = page.getByTestId(`model-option-${configured.model}`);
  await expect(configuredModelOption).toBeVisible();
  const configuredModelLabel = (await configuredModelOption.innerText()).trim();
  await expect(page.getByTestId("model-option-host-default")).toContainText(configuredModelLabel);
  await expect(page.getByTestId("effort-option-default")).toContainText(
    effortDisplayLabel(configured.effort),
  );
  await page.getByTestId("model-selector-close").click();

  const offset = await realtimeClientMessageCount(page);
  await page.getByPlaceholder("输入后续修改要求").fill("/");
  await page.getByTestId("slash-command-new").click();
  const threadStart = z
    .object({
      hostId: z.number(),
      projectId: z.number(),
      model: z.string().nullable().optional(),
      effort: z.string().nullable().optional(),
    })
    .loose()
    .parse(await waitForRealtimeClientMessage(page, "thread.start", offset));
  expect(threadStart).toMatchObject({ projectId: project.id });
  expect(threadStart.model).toBeUndefined();
  expect(threadStart.effort).toBeUndefined();
});

test("references real project files as structured turn context", async ({
  page,
  remoteWorkspace,
}) => {
  await installRealtimeSocketProbe(page);
  await openApp(page);
  const { remote } = remoteWorkspace;
  const projectPath = `/tmp/codex-gateway-file-reference-${Date.now()}`;
  // This deliberately remains a plain directory. File mentions must work on
  // minimal remote hosts without relying on a Git worktree or ripgrep.
  await execRemoteSsh(remote, `mkdir -p -- ${shellQuote(projectPath)}`);
  const { host, project } = await remoteWorkspace.provision({
    hostName: `file-reference-host-${Date.now()}`,
    remotePath: projectPath,
  });
  const threadId = await remoteWorkspace.startThread(project.id);
  await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible();
  await selectSidebarThread(page, threadId);

  const suffix = Date.now();
  const fileName = `e2e-file-reference-${suffix}.txt`;
  const rootFileName = `e2e-file-reference-${suffix}-root.txt`;
  const directory = [
    `deep-${"a".repeat(110)}`,
    `nested-${"b".repeat(110)}`,
    `leaf-${"c".repeat(110)}`,
  ].join("/");
  const path = `${directory}/${fileName}`;
  const marker = `STRUCTURED_FILE_REFERENCE_${suffix}`;
  await execRemoteSsh(
    remote,
    `mkdir -p -- ${shellQuote(`${project.remotePath}/${directory}`)} && printf '%s\\n' ${shellQuote(marker)} > ${shellQuote(`${project.remotePath}/${path}`)} && printf '%s\\n' root > ${shellQuote(`${project.remotePath}/${rootFileName}`)}`,
  );

  const composer = page.getByPlaceholder("输入后续修改要求");
  await composer.fill(`@reference-${suffix}`);
  const menu = page.getByTestId("file-mention-menu");
  await expect(menu).toBeVisible();
  const nestedOption = menu.getByRole("option").filter({ hasText: fileName });
  const rootOption = menu.getByRole("option").filter({ hasText: rootFileName });
  await expect(nestedOption).toHaveCount(1);
  await expect(rootOption).toHaveCount(1);
  await expect(nestedOption).toHaveCSS("justify-content", "flex-start");
  await expect(nestedOption.getByTestId("file-mention-name")).toHaveText(fileName);
  await expect(nestedOption.getByTestId("file-mention-directory")).toHaveText(directory);
  await expect(rootOption.getByTestId("file-mention-directory")).toHaveCount(0);
  const [nameBox, directoryBox, nestedOptionBox, rootOptionBox] = await Promise.all([
    nestedOption.getByTestId("file-mention-name").boundingBox(),
    nestedOption.getByTestId("file-mention-directory").boundingBox(),
    nestedOption.boundingBox(),
    rootOption.boundingBox(),
  ]);
  expect(nameBox).not.toBeNull();
  expect(directoryBox).not.toBeNull();
  expect(nestedOptionBox).not.toBeNull();
  expect(rootOptionBox).not.toBeNull();
  expect(
    Math.min(nameBox!.y + nameBox!.height, directoryBox!.y + directoryBox!.height),
  ).toBeGreaterThan(Math.max(nameBox!.y, directoryBox!.y));
  expect(Math.abs(nestedOptionBox!.y - rootOptionBox!.y)).toBeGreaterThanOrEqual(
    Math.min(nestedOptionBox!.height, rootOptionBox!.height) - 1,
  );
  const label = nestedOption.getByTestId("file-mention-label");
  await expect(label).toHaveCSS("overflow", "hidden");
  await expect(label).toHaveCSS("text-overflow", "ellipsis");
  await expect(label).toHaveCSS("white-space", "nowrap");
  expect(await label.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await nestedOption.click();
  const chip = page.locator(".cm-file-reference", { hasText: `@${fileName}` });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText(`@${fileName}`);
  await expect(chip).not.toContainText(directory);
  await expect(composer).toHaveAttribute("data-value", `@${path} `);

  await composer.press("Backspace");
  await expect(chip).toBeVisible();
  await expect(composer).toHaveAttribute("data-value", `@${path}`);
  await composer.press("Backspace");
  await expect(chip).toBeHidden();
  await expect(composer).toHaveAttribute("data-value", "");

  await composer.fill(`@reference-${suffix}`);
  const realtimeOffset = await realtimeClientMessageCount(page);
  await expect(menu.getByTestId("file-mention-option-0")).toHaveAttribute("aria-selected", "true");
  await composer.press("ArrowDown");
  await expect(menu.getByTestId("file-mention-option-1")).toHaveAttribute("aria-selected", "true");
  await composer.press("ArrowUp");
  await expect(menu.getByTestId("file-mention-option-0")).toHaveAttribute("aria-selected", "true");
  const keyboardSelection = await menu
    .getByTestId("file-mention-option-0")
    .getAttribute("data-file-path");
  expect([path, rootFileName]).toContain(keyboardSelection);
  await composer.press("Enter");
  await expect(menu).toBeHidden();
  await expect(composer).toHaveAttribute("data-value", `@${keyboardSelection} `);
  const messageTypesAfterKeyboardSelection = await page.evaluate(
    (offset) =>
      (window.__gatewayRealtimeProbe?.messages ?? []).slice(offset).map((message) => message.type),
    realtimeOffset,
  );
  expect(messageTypesAfterKeyboardSelection).not.toContain("turn.start");
  await composer.press("Backspace");
  await composer.press("Backspace");

  await composer.fill(`@reference-${suffix}`);
  await menu.getByRole("option").filter({ hasText: fileName }).click();
  await expect(chip).toBeVisible();

  await composer.press("End");
  await composer.pressSequentially(" 请读取这个引用文件，并且只回复文件中的唯一标记。");
  const messageOffset = await realtimeClientMessageCount(page);
  await page.getByTestId("send-turn-button").click();
  const message = z
    .object({
      projectId: z.number(),
      text: z.string(),
      references: z.array(
        z.object({ type: z.literal("file"), path: z.string(), name: z.string() }).strict(),
      ),
    })
    .loose()
    .parse(await waitForRealtimeClientMessage(page, "turn.start", messageOffset));
  expect(message.projectId).toBe(project.id);
  expect(message.text).toContain(`@${path}`);
  expect(message.references).toEqual([{ type: "file", path, name: fileName }]);
  expect(JSON.stringify(message)).not.toContain(marker);

  const traversalResponse = await sendRealtimeRawRequest(page, {
    type: "turn.start",
    requestId: randomUUID(),
    hostId: host.id,
    projectId: project.id,
    threadId,
    text: "invalid reference",
    references: [{ type: "file", path: "../outside.txt", name: "outside.txt" }],
  });
  expect(traversalResponse.type).toBe("error");
  if (traversalResponse.type === "error") {
    expect(traversalResponse.message).toContain("path traversal");
  }
  await execRemoteSsh(
    remote,
    `rm -rf -- ${shellQuote(`${project.remotePath}/${directory}`)} && rm -f -- ${shellQuote(`${project.remotePath}/${rootFileName}`)}`,
  );
});

test("connects to a real SSH Codex host and lists a project thread created by app-server", async ({
  page,
  remoteWorkspace,
}) => {
  const { remote } = remoteWorkspace;
  await installRealtimeSocketProbe(page);

  await openApp(page);
  await expect(page.getByPlaceholder("输入后续修改要求")).toBeHidden();
  await expect.poll(() => activeRealtimeSocketCount(page), { timeout: 10_000 }).toBe(1);

  const hostName = `docker-codex-${Date.now()}`;
  const host = await remoteWorkspace.addHost(hostName);
  await verifyRemoteDirectoryBrowser(page, remote, host.id, hostName);
  const discovered = await createRemoteHistoricalRollout(remote);
  const discoveryResponse = await authenticatedFetch(
    page,
    { url: `/api/threads?hostId=${host.id}&limit=50` },
    (value) =>
      z
        .object({
          projects: z.array(z.object({ hostId: z.number(), remotePath: z.string() }).loose()),
          data: z.array(
            z
              .object({
                id: z.string(),
                cwd: z.string().nullable().optional(),
                source: z.string().nullable().optional(),
                modelProvider: z.string().nullable().optional(),
              })
              .loose(),
          ),
        })
        .loose()
        .parse(value),
  );
  expect(
    discoveryResponse.projects.some(
      (candidate) =>
        candidate.hostId === host.id && candidate.remotePath === discovered.projectPath,
    ),
    JSON.stringify(discoveryResponse.projects),
  ).toBe(true);
  expect(
    discoveryResponse.data.some(
      (candidate) =>
        String(candidate.id) === discovered.threadId &&
        candidate.cwd === discovered.projectPath &&
        candidate.source === "exec" &&
        candidate.modelProvider === discovered.modelProvider,
    ),
    JSON.stringify({
      projects: discoveryResponse.projects,
      threads: discoveryResponse.data,
      expected: discovered,
    }),
  ).toBe(true);

  const project = await remoteWorkspace.addProject(host.id);

  await expect(page.getByTestId("project-thread-list")).toBeVisible();
  await expect(
    page.getByTestId("project-thread-list").getByRole("heading", { name: project.name }),
  ).toBeVisible();
  await page.getByTestId("open-terminal-button").click();
  await expect(page.getByTestId("terminal-panel")).toBeVisible({ timeout: 30_000 });
  await runTerminalCommand(page, "pwd");
  await expectTerminalContains(page, remote.projectPath);
  const terminalMarker = `codex-gateway-terminal-${Date.now()}`;
  await runTerminalCommand(page, `echo ${terminalMarker}`);
  await expectTerminalContains(page, terminalMarker);
  await page.getByRole("tab", { name: /Agent/ }).click();
  await expect(page.getByTestId("project-thread-list")).toBeVisible();
  await page.getByRole("tab", { name: project.name }).click();
  await expectTerminalContains(page, terminalMarker);
  await reloadApp(page);
  await expect(page.getByRole("tab", { name: project.name })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: project.name }).click();
  await expectTerminalContains(page, terminalMarker);
  await page
    .getByRole("tab", { name: project.name })
    .getByLabel(/关闭标签页|Close tab/)
    .click();
  await expect(page.getByRole("tab", { name: project.name })).toBeHidden();

  await page.getByPlaceholder("输入后续修改要求").fill("/");
  await expect(page.getByTestId("slash-command-menu")).toBeVisible();
  await expect(page.getByTestId("slash-command-new")).toBeVisible();
  await expect(page.getByTestId("slash-command-plan")).toBeHidden();
  await page.getByTestId("slash-command-new").click();
  const slashNewThreadId = await waitForSelectedThreadId(page);
  await expect(page.getByTestId(`thread-button-${slashNewThreadId}`)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByPlaceholder("输入后续修改要求").fill("/");
  await expect(page.getByTestId("slash-command-menu")).toBeVisible();
  await expect(page.getByTestId("slash-command-plan")).toBeVisible();
  const planSettingsResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/threads/settings") && response.request().method() === "POST",
  );
  await page.getByTestId("slash-command-plan").click();
  const planSettingsResponse = await planSettingsResponsePromise;
  expect(planSettingsResponse.ok()).toBe(true);
  const planSettingsRequest = z
    .object({
      hostId: z.number(),
      threadId: z.string(),
      collaborationMode: z.object({
        mode: z.literal("plan"),
        settings: z.object({ model: z.string().min(1) }).loose(),
      }),
    })
    .loose()
    .parse(planSettingsResponse.request().postDataJSON());
  expect(planSettingsRequest).toMatchObject({
    hostId: host.id,
    threadId: slashNewThreadId,
    collaborationMode: { mode: "plan" },
  });
  await expect(page.getByTestId("composer-mode-strip").getByText("计划模式").first()).toBeVisible();
  const planTurnOffset = await realtimeClientMessageCount(page);
  await page.getByPlaceholder("输入后续修改要求").fill("请为当前项目制定一个简短计划，不要执行。");
  await page.getByTestId("send-turn-button").click();
  const planTurnStart = z
    .object({
      collaborationMode: z.object({
        mode: z.literal("plan"),
        settings: z.object({ model: z.string().min(1) }).loose(),
      }),
    })
    .loose()
    .parse(await waitForRealtimeClientMessage(page, "turn.start", planTurnOffset));
  expect(planTurnStart.collaborationMode.mode).toBe("plan");

  const threadId = await remoteWorkspace.startThread(project.id);
  await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible();
  const secondThreadId = await remoteWorkspace.startThread(project.id);
  await expect(page.getByTestId(`thread-button-${secondThreadId}`)).toBeVisible();

  const firstDraft = `E2E 草稿一 ${Date.now()}`;
  const secondDraft = `E2E 草稿二 ${Date.now()}`;
  await selectSidebarThread(page, threadId);
  await page.getByPlaceholder("输入后续修改要求").fill(firstDraft);
  await selectSidebarThread(page, secondThreadId);
  await expect(page.getByPlaceholder("输入后续修改要求")).toHaveAttribute("data-value", "");
  await page.getByPlaceholder("输入后续修改要求").fill(secondDraft);
  await selectSidebarThread(page, threadId);
  await expect(page.getByPlaceholder("输入后续修改要求")).toHaveAttribute("data-value", firstDraft);
  await selectSidebarThread(page, secondThreadId);
  await expect(page.getByPlaceholder("输入后续修改要求")).toHaveAttribute(
    "data-value",
    secondDraft,
  );
  await page.getByPlaceholder("输入后续修改要求").fill("");

  await selectSidebarThread(page, threadId);
  await selectSidebarThread(page, secondThreadId);
  await selectSidebarThread(page, threadId);
  expect(await activeRealtimeSocketCount(page)).toBe(1);

  const marker = `E2E 置顶恢复 ${Date.now()}`;
  await sendTextTurn(page, marker);
  const recentThread = page.getByTestId(`recent-thread-button-${threadId}`);
  await expect(recentThread).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("chat-scroll-area").getByText(marker)).toBeVisible({
    timeout: AGENT_OUTPUT_TIMEOUT_MS,
  });
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: AGENT_OUTPUT_TIMEOUT_MS,
  });
  // This list is page-session activity, not merely a projection of the current
  // running keys. A completed thread remains discoverable until the page reloads.
  await expect(recentThread).toBeVisible();

  const staleTurnsResponse = await sendRealtimeRawRequest(page, {
    type: "thread.turns.load",
    requestId: `e2e-stale-turns-${randomUUID()}`,
    hostId: host.id,
    threadId,
    cursor: JSON.stringify({ turnId: randomUUID(), includeAnchor: false }),
    limit: 5,
    sortDirection: "desc",
  });
  expect(staleTurnsResponse.type, JSON.stringify(staleTurnsResponse)).toBe("error");
  if (staleTurnsResponse.type !== "error") {
    throw new Error(`Expected realtime error response: ${JSON.stringify(staleTurnsResponse)}`);
  }
  expect(staleTurnsResponse.code, JSON.stringify(staleTurnsResponse)).toBe(
    STALE_THREAD_CURSOR_ERROR_CODE,
  );

  await reloadApp(page);
  await expect(page.getByTestId(`recent-thread-button-${threadId}`)).toBeHidden();
  await expect(page.getByTestId(`thread-button-${threadId}`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成");
  const afterReloadMarker = `E2E 刷新后新轮 ${Date.now()}`;
  await page.getByPlaceholder("输入后续修改要求").fill(`用一句话回复：${afterReloadMarker}`);
  await page.getByTestId("send-turn-button").click();
  await expect.poll(() => chatViewportBottomDistance(page)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("chat-scroll-area").getByText(afterReloadMarker)).toBeVisible({
    timeout: AGENT_OUTPUT_TIMEOUT_MS,
  });
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: AGENT_OUTPUT_TIMEOUT_MS,
  });

  await page.getByTestId(`thread-button-${threadId}`).click({ button: "right" });
  await page.getByRole("menuitem", { name: /置顶/ }).click();
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toBeVisible();

  await page.getByTestId(`pinned-thread-button-${threadId}`).click();
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeHidden();
  await expect
    .poll(async () =>
      page.getByTestId("chat-scroll-area").evaluate((root) => {
        const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
        if (!viewport) return false;
        return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
      }),
    )
    .toBe(true);

  await reloadApp(page);
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toBeVisible();
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeHidden();
  await expect
    .poll(async () =>
      page.getByTestId("chat-scroll-area").evaluate((root) => {
        const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
        if (!viewport) return false;
        return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
      }),
    )
    .toBe(true);

  await page.getByTestId(`host-button-${host.id}`).click();
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeVisible();
  const updatedProjectPath = `/home/${remote.username}/nested-workdir-${Date.now()}`;
  await execRemoteSsh(remote, `mkdir -p '${updatedProjectPath}'`);
  const editProjectResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/projects/${project.id}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByTestId(`project-button-${project.id}`).click({ button: "right" });
  await page.getByRole("menuitem", { name: /编辑项目|Edit project/ }).click();
  await page.getByTestId("project-path-input").fill(updatedProjectPath);
  await page.getByTestId("add-project-button").click();
  const editProjectResponse = await editProjectResponsePromise;
  expect(editProjectResponse.ok(), await editProjectResponse.text()).toBe(true);
  const editedProject = projectRecordSchema.parse(await editProjectResponse.json());
  expect(editedProject.remotePath).toBe(updatedProjectPath);

  const deleteProjectResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/projects/${project.id}`) &&
      response.request().method() === "DELETE",
  );
  await page.getByTestId(`project-button-${project.id}`).click({ button: "right" });
  await page.getByRole("menuitem", { name: /删除项目|Delete project/ }).click();
  const deleteProjectResponse = await deleteProjectResponsePromise;
  expect(deleteProjectResponse.ok(), await deleteProjectResponse.text()).toBe(true);
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeHidden();
});

test("groups projects whose remote directories were deleted", async ({ page, remoteWorkspace }) => {
  const { remote } = remoteWorkspace;
  await openApp(page);

  const host = await remoteWorkspace.addHost(`missing-project-host-${Date.now()}`);
  const suffix = Date.now();
  const availablePath = `/home/${remote.username}/available-project-${suffix}`;
  const missingPath = `/home/${remote.username}/missing-project-${suffix}`;
  const recoveredPath = `/home/${remote.username}/recovered-project-${suffix}`;
  await execRemoteSsh(
    remote,
    `mkdir -p '${availablePath}' '${recoveredPath}'; rm -rf '${missingPath}'`,
  );

  const availableProject = await authenticatedFetch(
    page,
    {
      url: "/api/projects",
      method: "POST",
      body: { hostId: host.id, name: "Available Project", remotePath: availablePath },
    },
    (value) => projectRecordSchema.parse(value),
  );
  const missingProject = await authenticatedFetch(
    page,
    {
      url: "/api/projects",
      method: "POST",
      body: { hostId: host.id, name: "Missing Project", remotePath: missingPath },
    },
    (value) => projectRecordSchema.parse(value),
  );

  await reloadApp(page);
  const missingToggle = page.getByTestId(`missing-projects-toggle-${host.id}`);
  await expect(missingToggle).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId(`project-button-${availableProject.id}`)).toBeVisible();
  await expect(page.getByTestId(`project-button-${missingProject.id}`)).toBeHidden();

  await missingToggle.click();
  const missingProjectButton = page.getByTestId(`project-button-${missingProject.id}`);
  await expect(missingProjectButton).toBeVisible();
  await expect(missingProjectButton).toHaveAttribute("data-project-missing", "true");
  await missingProjectButton.click({ button: "right" });
  const menu = page
    .getByRole("menu")
    .filter({ has: page.getByRole("menuitem", { name: /编辑项目/ }) });
  await expect(menu.getByRole("menuitem", { name: /编辑项目/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /删除项目/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /新建/ })).toBeHidden();
  await menu.getByRole("menuitem", { name: /编辑项目/ }).click();

  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/projects/${missingProject.id}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByTestId("project-path-input").fill(recoveredPath);
  await page.getByTestId("add-project-button").click();
  expect((await updateResponse).ok()).toBe(true);

  await expect(missingToggle).toBeHidden({ timeout: 30_000 });
  await expect(missingProjectButton).toBeVisible();
  await expect(missingProjectButton).toHaveAttribute("data-project-missing", "false");
});

async function verifyRemoteDirectoryBrowser(
  page: Page,
  remote: RemoteCodexEnv,
  hostId: number,
  hostName: string,
) {
  const directoryName = `gateway-directory-${Date.now()}`;
  await execRemoteSsh(remote, `mkdir -p "$HOME/media/${directoryName}"`);

  await page.getByTestId(`host-button-${hostId}`).click({ button: "right" });
  await page.getByRole("menuitem", { name: /添加项目|Add project/ }).click();
  await page.getByTestId("project-browse-path-input").fill("media/");
  await page.getByRole("button", { name: /浏览|Browse/ }).click();
  await expect(page.getByTestId("project-browse-path-input")).toHaveValue(
    `/home/${remote.username}/media`,
  );
  await expect(page.getByRole("button", { name: directoryName })).toBeVisible();

  const missingPath = `/home/${remote.username}/missing-directory-${Date.now()}`;
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/remote/directories?") && response.request().method() === "GET",
  );
  await page.getByTestId("project-browse-path-input").fill(missingPath);
  await page.getByRole("button", { name: /浏览|Browse/ }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(404);
  const payload = z
    .object({ code: z.string(), message: z.string() })
    .loose()
    .parse(await response.json());
  expect(payload.code).toBe("remoteDirectoryNotFound");
  expect(payload.message).toContain(missingPath);
  await expect(page.getByText(new RegExp(`Remote directory.*${missingPath}`))).toBeVisible();
  await expect(page.getByText(new RegExp(`主机: ${hostName}|Host: ${hostName}`))).toBeVisible();

  const deniedResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/remote/directories?") && response.request().method() === "GET",
  );
  await page.getByTestId("project-browse-path-input").fill("/root");
  await page.getByRole("button", { name: /浏览|Browse/ }).click();
  const deniedResponse = await deniedResponsePromise;
  expect(deniedResponse.status()).toBe(403);
  const deniedPayload = z
    .object({ code: z.string(), message: z.string() })
    .loose()
    .parse(await deniedResponse.json());
  expect(deniedPayload.code).toBe("remoteDirectoryAccessDenied");
  expect(deniedPayload.message).toContain("/root");
  await page.keyboard.press("Escape");
}

async function createRemoteHistoricalRollout(remote: RemoteCodexEnv) {
  const suffix = Date.now();
  const threadId = randomUUID();
  const cwd = "/home/codex";
  const modelProvider = `e2e-provider-${suffix}`;
  const filenameTimestamp = timestampForRolloutFile(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)));
  const rfc3339 = "2026-01-02T03:04:05Z";
  const preview = `E2E auto-discovered historical thread ${suffix}`;
  const script = `
set -eu
codex_home="\${CODEX_HOME:-$HOME/.codex}"
rollout_dir="$codex_home/sessions/2026/01/02"
mkdir -p "$rollout_dir"
rollout_path="$rollout_dir/rollout-${filenameTimestamp}-${threadId}.jsonl"
cat > "$rollout_path" <<'JSONL'
${JSON.stringify({
  timestamp: rfc3339,
  type: "session_meta",
  payload: {
    session_id: threadId,
    id: threadId,
    forked_from_id: null,
    parent_thread_id: null,
    timestamp: rfc3339,
    cwd,
    originator: "codex",
    cli_version: "0.142.4",
    source: "exec",
    thread_source: null,
    agent_path: null,
    agent_nickname: null,
    agent_role: null,
    model_provider: modelProvider,
    base_instructions: null,
    dynamic_tools: null,
    memory_mode: null,
    multi_agent_version: null,
    git: null,
  },
})}
${JSON.stringify({
  timestamp: rfc3339,
  type: "response_item",
  payload: {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: preview }],
  },
})}
${JSON.stringify({
  timestamp: rfc3339,
  type: "event_msg",
  payload: {
    type: "user_message",
    message: preview,
    kind: "plain",
  },
})}
JSONL
touch -d ${shellQuote(rfc3339)} "$rollout_path"
`;
  await execRemoteSsh(remote, script);
  return { modelProvider, projectPath: cwd, threadId };
}

async function runTerminalCommand(page: Page, command: string) {
  await page.getByTestId("terminal-root").click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

async function expectTerminalContains(page: Page, text: string) {
  await expect
    .poll(
      async () =>
        page.getByTestId("terminal-panel").evaluate((element) => element.textContent || ""),
      { timeout: 30_000 },
    )
    .toContain(text);
}

function timestampForRolloutFile(date: Date) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replaceAll(":", "-");
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function effortDisplayLabel(value: string) {
  const labels: Record<string, string> = {
    low: "Light",
    light: "Light",
    medium: "Medium",
    high: "High",
    xhigh: "Extra High",
  };
  return labels[value] ?? value;
}
