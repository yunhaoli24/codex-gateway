import { expect, test, type Page, type WebSocket } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import {
  addRemoteHost,
  addRemoteProject,
  execRemoteSsh,
  readRemoteEnv,
  sendTextTurn,
  startRemoteThreadFromProjectMenu,
} from "./helpers/remote-codex";

test("connects to a real SSH Codex host and lists a project thread created by app-server", async ({
  page,
}) => {
  const remote = await readRemoteEnv();
  const realtimeSockets = trackActiveRealtimeSockets(page);

  await openApp(page);
  await expect(page.getByPlaceholder("输入后续修改要求")).toBeHidden();
  await expect.poll(() => realtimeSockets.size, { timeout: 10_000 }).toBe(1);

  const host = await addRemoteHost(page, remote);
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
  await page.getByPlaceholder("输入后续修改要求").fill("/");
  await expect(page.getByTestId("slash-command-menu")).toBeVisible();
  await expect(page.getByTestId("slash-command-new")).toBeVisible();
  await expect(page.getByTestId("slash-command-plan")).toBeHidden();
  const slashNewResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/threads/start") && response.request().method() === "POST",
  );
  await page.getByTestId("slash-command-new").click();
  const slashNewThread = await (await slashNewResponsePromise).json();
  const slashNewThreadId = String(slashNewThread.thread.id);
  await expect(page.getByTestId(`thread-button-${slashNewThreadId}`)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByPlaceholder("输入后续修改要求").fill("/");
  await expect(page.getByTestId("slash-command-menu")).toBeVisible();
  await expect(page.getByTestId("slash-command-plan")).toBeVisible();
  await page.getByTestId("slash-command-plan").click();
  await expect(page.getByText("计划模式")).toBeVisible();
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

  const openResponses: number[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.url().endsWith("/api/threads/open") && request.method() === "POST") {
      openResponses.push(response.status());
    }
  });
  await page.getByTestId(`thread-button-${threadId}`).click();
  await page.getByTestId(`thread-button-${secondThreadId}`).click();
  await page.getByTestId(`thread-button-${threadId}`).click();
  await expect.poll(() => openResponses.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  expect(openResponses.every((status) => status >= 200 && status < 300)).toBe(true);
  expect(realtimeSockets.size).toBe(1);

  const marker = `E2E 置顶恢复 ${Date.now()}`;
  await sendTextTurn(page, marker);
  await expect(page.getByTestId("chat-scroll-area").getByText(marker)).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 120_000,
  });

  await reloadApp(page);
  await expect(page.getByTestId(`thread-button-${threadId}`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成");
  const afterReloadMarker = `E2E 刷新后新轮 ${Date.now()}`;
  const turnStartAfterReload = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/turns/start") && response.request().method() === "POST",
  );
  let steerRequestsAfterReload = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/turns/steer") && request.method() === "POST") {
      steerRequestsAfterReload += 1;
    }
  });
  await page.getByPlaceholder("输入后续修改要求").fill(`用一句话回复：${afterReloadMarker}`);
  await page.getByTestId("send-turn-button").click();
  const turnStartResponse = await turnStartAfterReload;
  expect(turnStartResponse.ok(), await turnStartResponse.text()).toBe(true);
  expect(steerRequestsAfterReload).toBe(0);
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
  const updatedProjectPath = `${remote.projectPath}/nested-workdir-${Date.now()}`;
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

function timestampForRolloutFile(date: Date) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "")
    .replaceAll(":", "-");
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
