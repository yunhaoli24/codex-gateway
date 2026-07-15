import { expect, test, type Page, type WebSocket } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { STALE_THREAD_CURSOR_ERROR_CODE } from "../../shared/gateway-errors";
import { sendRealtimeRawRequest } from "./helpers/realtime";
import {
  addRemoteHost,
  addRemoteProject,
  execRemoteSsh,
  readRemoteEnv,
  sendTextTurn,
  startRemoteThreadFromProjectMenu,
  waitForSelectedThreadId,
} from "./helpers/remote-codex";

test("connects to a real SSH Codex host and lists a project thread created by app-server", async ({
  page,
}) => {
  const remote = await readRemoteEnv();
  const realtimeSockets = trackActiveRealtimeSockets(page);

  await openApp(page);
  await expect(page.getByPlaceholder("输入后续修改要求")).toBeHidden();
  await expect.poll(() => realtimeSockets.size, { timeout: 10_000 }).toBe(1);

  const hostName = `docker-codex-${Date.now()}`;
  const host = await addRemoteHost(page, remote, hostName);
  await verifyRemoteDirectoryBrowser(page, remote, host.id, hostName);
  const discovered = await createRemoteHistoricalRollout(remote);
  const discoveryResponse = await authenticatedFetch<any>(page, {
    url: `/api/threads?hostId=${host.id}&limit=50`,
  });
  expect(
    discoveryResponse.projects.some(
      (candidate: any) =>
        candidate.hostId === host.id && candidate.remotePath === discovered.projectPath,
    ),
    JSON.stringify(discoveryResponse.projects),
  ).toBe(true);
  expect(
    discoveryResponse.data.some(
      (candidate: any) =>
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

  const project = await addRemoteProject(page, remote, host.id);

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
  await page.getByTestId("slash-command-plan").click();
  await expect(page.getByTestId("composer-mode-strip").getByText("计划模式").first()).toBeVisible();
  await page.getByPlaceholder("输入后续修改要求").fill("");

  const threadId = await startRemoteThreadFromProjectMenu(page, project.id);
  await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible();
  const secondThreadId = await startRemoteThreadFromProjectMenu(page, project.id);
  await expect(page.getByTestId(`thread-button-${secondThreadId}`)).toBeVisible();

  const firstDraft = `E2E 草稿一 ${Date.now()}`;
  const secondDraft = `E2E 草稿二 ${Date.now()}`;
  await page.getByTestId(`thread-button-${threadId}`).click();
  await page.getByPlaceholder("输入后续修改要求").fill(firstDraft);
  await page.getByTestId(`thread-button-${secondThreadId}`).click();
  await expect(page.getByPlaceholder("输入后续修改要求")).toHaveValue("");
  await page.getByPlaceholder("输入后续修改要求").fill(secondDraft);
  await page.getByTestId(`thread-button-${threadId}`).click();
  await expect(page.getByPlaceholder("输入后续修改要求")).toHaveValue(firstDraft);
  await page.getByTestId(`thread-button-${secondThreadId}`).click();
  await expect(page.getByPlaceholder("输入后续修改要求")).toHaveValue(secondDraft);
  await page.getByPlaceholder("输入后续修改要求").fill("");

  await page.getByTestId(`thread-button-${threadId}`).click();
  await expect(page.getByTestId(`thread-button-${threadId}`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  await page.getByTestId(`thread-button-${secondThreadId}`).click();
  await expect(page.getByTestId(`thread-button-${secondThreadId}`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  await page.getByTestId(`thread-button-${threadId}`).click();
  await expect(page.getByTestId(`thread-button-${threadId}`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  expect(realtimeSockets.size).toBe(1);

  const marker = `E2E 置顶恢复 ${Date.now()}`;
  await sendTextTurn(page, marker);
  const recentThread = page.getByTestId(`recent-thread-button-${threadId}`);
  await expect(recentThread).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("chat-scroll-area").getByText(marker)).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 120_000,
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
  expect(staleTurnsResponse.code).toBe(STALE_THREAD_CURSOR_ERROR_CODE);

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
  await expect(page.getByTestId("chat-scroll-area").getByText(afterReloadMarker)).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 120_000,
  });

  await page.getByTestId(`thread-button-${threadId}`).click({ button: "right" });
  await page.getByRole("menuitem", { name: /置顶/ }).click();
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toBeVisible();

  await page.getByTestId(`pinned-thread-button-${threadId}`).click();
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeHidden();
  await expect
    .poll(async () =>
      page.getByTestId("chat-scroll-area").evaluate((root) => {
        const viewport = root.querySelector(
          '[data-slot="scroll-area-viewport"]',
        ) as HTMLElement | null;
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
        const viewport = root.querySelector(
          '[data-slot="scroll-area-viewport"]',
        ) as HTMLElement | null;
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
  const editedProject = await editProjectResponse.json();
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

test("groups projects whose remote directories were deleted", async ({ page }) => {
  const remote = await readRemoteEnv();
  await openApp(page);

  const host = await addRemoteHost(page, remote, `missing-project-host-${Date.now()}`);
  const suffix = Date.now();
  const availablePath = `/home/${remote.username}/available-project-${suffix}`;
  const missingPath = `/home/${remote.username}/missing-project-${suffix}`;
  const recoveredPath = `/home/${remote.username}/recovered-project-${suffix}`;
  await execRemoteSsh(
    remote,
    `mkdir -p '${availablePath}' '${recoveredPath}'; rm -rf '${missingPath}'`,
  );

  const availableProject = await authenticatedFetch<any>(page, {
    url: "/api/projects",
    method: "POST",
    body: { hostId: host.id, name: "Available Project", remotePath: availablePath },
  });
  const missingProject = await authenticatedFetch<any>(page, {
    url: "/api/projects",
    method: "POST",
    body: { hostId: host.id, name: "Missing Project", remotePath: missingPath },
  });

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
  remote: Awaited<ReturnType<typeof readRemoteEnv>>,
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

  const missingPath = `missing-directory-${Date.now()}`;
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/remote/directories?") && response.request().method() === "GET",
  );
  await page.getByTestId("project-browse-path-input").fill(missingPath);
  await page.getByRole("button", { name: /浏览|Browse/ }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(404);
  const payload = await response.json();
  expect(payload.code).toBe("remoteDirectoryNotFound");
  expect(payload.message).toContain(missingPath);
  expect(payload.message).toContain(`/home/${remote.username}/${missingPath}`);
  await expect(page.getByText(new RegExp(`Remote directory.*${missingPath}`))).toBeVisible();
  await expect(page.getByText(new RegExp(`主机: ${hostName}|Host: ${hostName}`))).toBeVisible();
  await page.keyboard.press("Escape");
}

function trackActiveRealtimeSockets(page: Page) {
  const sockets = new Set<WebSocket>();
  page.on("websocket", (webSocket) => {
    if (!webSocket.url().endsWith("/api/realtime")) {
      return;
    }
    sockets.add(webSocket);
    webSocket.on("close", () => {
      sockets.delete(webSocket);
    });
  });
  return sockets;
}

async function createRemoteHistoricalRollout(remote: Awaited<ReturnType<typeof readRemoteEnv>>) {
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
