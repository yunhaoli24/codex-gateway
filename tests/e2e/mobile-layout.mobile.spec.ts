import { expect, test, type Locator, type Page } from "@playwright/test";
import type { HostRecord, ProjectRecord } from "../../shared/types";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { seedGatewayThread } from "./helpers/gateway-store";
import {
  buildTextTurns,
  frameSpread,
  installDeferredThreadTurnsLoadStub,
  releaseDeferredThreadTurnsLoad,
  startBottomDistanceTracking,
  startLocatorTopTracking,
  stopFrameTracking,
  threadTurnCount,
  threadTurnsLoadRequests,
  waitForAnimationFrames,
} from "./helpers/history-top-up";
import { execRemoteSsh, readRemoteEnv, waitForSelectedThreadId } from "./helpers/remote-codex";

test("uses the mobile layout with hidden sidebar and usable composer shell", async ({ page }) => {
  await openApp(page);

  await expect(page.getByTestId("mobile-layout")).toBeVisible();
  await expect(page.getByTestId("desktop-layout")).toBeHidden();
  await expect(page.getByTestId("settings-toggle")).toBeHidden();

  await page.getByTestId("mobile-sidebar-toggle").click();
  await expect(page.getByTestId("settings-toggle")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-toggle")).toBeHidden();

  await expect(page.getByTestId("chat-scroll-area")).toBeVisible();
  await expect(page.getByText("先选择一个项目")).toBeVisible();
});

test("background history top-up keeps the mobile timeline visually stable", async ({ page }) => {
  await openApp(page);
  const threadId = "mobile-background-turn-top-up";
  await installDeferredThreadTurnsLoadStub(page, {
    type: "thread.turns.page",
    requestId: "mobile-thread-turns-page",
    hostId: 1,
    threadId,
    history: {
      thread: { id: threadId, turns: buildTextTurns(1, 3, "mobile top-up turn", 14) },
    },
    turnsPage: { nextCursor: null, backwardsCursor: null },
  });
  await seedGatewayThread(page, {
    projectId: 1,
    threadId,
    currentThread: { id: threadId, name: "Mobile Top Up" },
    olderTurnsCursor: JSON.stringify({ turnId: "turn-004", includeAnchor: false }),
    history: {
      thread: { id: threadId, turns: buildTextTurns(4, 5, "mobile top-up turn", 14) },
    },
  });

  const latestRow = page.locator('[data-row-key$=":turn-turn-005"]');
  await expect(latestRow).toBeVisible();
  await expect
    .poll(() => threadTurnsLoadRequests(page).then((requests) => requests.length))
    .toBe(1);
  await startLocatorTopTracking(latestRow);
  await releaseDeferredThreadTurnsLoad(page);
  await expect.poll(() => threadTurnCount(page)).toBe(5);
  await waitForAnimationFrames(page, 8);
  const samples = await stopFrameTracking(page);
  expect(frameSpread(samples), JSON.stringify(samples)).toBeLessThanOrEqual(2);
});

test("mobile viewport resize during history top-up stays bottom pinned", async ({ page }) => {
  await openApp(page);
  const threadId = "mobile-resizing-turn-top-up";
  await installDeferredThreadTurnsLoadStub(page, {
    type: "thread.turns.page",
    requestId: "mobile-resizing-turns-page",
    hostId: 1,
    threadId,
    history: {
      thread: { id: threadId, turns: buildTextTurns(1, 3, "mobile resize turn", 14) },
    },
    turnsPage: { nextCursor: null, backwardsCursor: null },
  });
  await seedGatewayThread(page, {
    projectId: 1,
    threadId,
    currentThread: { id: threadId, name: "Mobile Resize Top Up" },
    olderTurnsCursor: JSON.stringify({ turnId: "turn-004", includeAnchor: false }),
    history: {
      thread: { id: threadId, turns: buildTextTurns(4, 5, "mobile resize turn", 14) },
    },
  });

  await expect
    .poll(() => threadTurnsLoadRequests(page).then((requests) => requests.length))
    .toBe(1);
  await startBottomDistanceTracking(page);
  await releaseDeferredThreadTurnsLoad(page);
  await page.setViewportSize({ width: 393, height: 820 });
  await expect.poll(() => threadTurnCount(page)).toBe(5);
  await waitForAnimationFrames(page, 8);
  const samples = await stopFrameTracking(page);
  // Chromium can expose one frame of the new external viewport geometry before
  // visualViewport/ResizeObserver callbacks run. The application contract is
  // that this does not become a multi-frame correction cascade and remains
  // pinned after that unavoidable browser-owned frame.
  expect(
    samples.filter((distance) => distance > 2).length,
    JSON.stringify(samples),
  ).toBeLessThanOrEqual(1);
  expect(Math.max(...samples.slice(-4)), JSON.stringify(samples)).toBeLessThanOrEqual(2);
});

test("opens sidebar context actions with long press on mobile", async ({ page }) => {
  const remote = await readRemoteEnv();
  await openApp(page);
  const { project } = await createConfiguredHostAndProject(page, remote);
  await reloadApp(page);

  if (
    !(await page
      .getByTestId("settings-toggle")
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByTestId("mobile-sidebar-toggle").click();
  }
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeVisible();
  await longPress(page, page.getByTestId(`project-button-${project.id}`));
  await page.getByRole("menuitem", { name: /新建/ }).click();
  const threadId = await waitForSelectedThreadId(page);

  await page.getByTestId("mobile-sidebar-toggle").click();
  await page.getByTestId(`project-button-${project.id}`).click();
  await expect(page.getByTestId("project-thread-list")).toBeVisible();
  await page.getByTestId("open-terminal-mobile-button").click();
  await expect(page.getByTestId("terminal-panel")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: /Agent/ }).click();
  await expect(page.getByTestId("project-thread-list")).toBeVisible();
  const threadButton = page.getByTestId(`project-thread-row-${threadId}`);
  await expect(threadButton).toBeVisible({ timeout: 30_000 });

  await longPress(page, threadButton);
  await page.getByRole("menuitem", { name: /置顶/ }).click();
  await page.getByTestId("mobile-sidebar-toggle").click();
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toBeVisible();
});

test("opens and closes the subagent side panel on mobile", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "mobile-parent-thread";
    const subThreadId = "mobile-subagent-thread";
    store.hosts = [{ id: 1, name: "Mobile Host", sshHost: "localhost", sshUser: "codex" }];
    store.selectedHostId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Mobile Parent" };
    store.history = {
      thread: {
        id: threadId,
        turns: [
          {
            id: "mobile-parent-turn",
            status: "running",
            items: [
              {
                id: "mobile-subagent-activity",
                type: "subAgentActivity",
                kind: "started",
                agentThreadId: subThreadId,
                agentPath: "mobile-agent",
              },
            ],
          },
        ],
      },
    };
    store.threadViews = {
      "1:mobile-subagent-thread": {
        hostId: 1,
        projectId: null,
        threadId: subThreadId,
        currentThread: { id: subThreadId, name: "mobile-agent" },
        history: {
          thread: {
            id: subThreadId,
            turns: [
              {
                id: "mobile-sub-turn",
                status: "completed",
                items: [
                  {
                    id: "mobile-sub-agent",
                    type: "agentMessage",
                    phase: "final_answer",
                    text: "Mobile subagent timeline is readable.",
                  },
                ],
              },
            ],
          },
        },
        events: [],
        olderTurnsCursor: null,
        newerTurnsCursor: null,
        lastEventId: 0,
        loading: false,
        error: null,
      },
    };
    store.initializing = false;
    store.loading = false;
  });

  await openIntermediateSteps(page);
  await page.getByTestId("open-subagent-panel").click();
  const panel = page.getByTestId("workspace-subagent-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Mobile subagent timeline is readable.")).toBeVisible();
  const panelBox = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(panelBox?.width).toBeGreaterThan((viewport?.width ?? 0) * 0.9);
  await page.getByRole("button", { name: "关闭标签页" }).last().click();
  await expect(panel).toBeHidden();
});

test("browses the current thread file workspace from a mobile sheet", async ({ page }) => {
  const remote = await readRemoteEnv();
  await openApp(page);
  const { host, project } = await createConfiguredHostAndProject(page, remote);
  const rootPath = `/home/${remote.username}`;
  const path = `${rootPath}/mobile-file-preview-${Date.now()}.md`;
  await execRemoteSsh(
    remote,
    `printf '%s\n' '# Mobile File Workspace' 'Rendered from the remote tree.' > ${shellQuote(path)}`,
  );
  const threadId = `mobile-file-thread-${Date.now()}`;
  await seedGatewayThread(page, {
    hostId: host.id,
    projectId: project.id,
    host: { ...host },
    project: { ...project },
    threadId,
    currentThread: { id: threadId, name: "Mobile Files", cwd: rootPath },
    history: { thread: { id: threadId, turns: [] } },
    status: "completed",
  });

  await page.locator('[data-testid="workspace-dock-tab"][data-panel-kind="files"]').click();
  await expect(page.getByRole("button", { name: "向右分屏" })).toHaveCount(0);
  const panel = page.getByTestId("workspace-file-panel");
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "文件树", exact: true }).click();
  const tree = page.getByTestId("remote-file-tree");
  await expect(tree).toBeVisible();
  await tree.getByText(path.split("/").pop()!, { exact: true }).click();
  await expect(panel.getByTestId("remote-file-editor")).toContainText("Mobile File Workspace");
  await panel.getByRole("button", { name: "预览" }).click();
  await expect(panel.locator(".markdown-content h1")).toHaveText("Mobile File Workspace");
  const panelBox = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(panelBox?.width).toBeLessThanOrEqual(viewport?.width ?? 0);
});

async function openIntermediateSteps(page: Page) {
  const toggle = page.getByRole("button", { name: /中间过程/ }).first();
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("data-state")) !== "open") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("data-state", "open");
}

async function createConfiguredHostAndProject(
  page: Page,
  remote: Awaited<ReturnType<typeof readRemoteEnv>>,
) {
  const host = await authenticatedFetch<HostRecord>(page, {
    url: "/api/hosts",
    method: "POST",
    body: {
      name: `mobile-longpress-host-${Date.now()}`,
      sshHost: remote.host,
      username: remote.username,
      port: Number(remote.port),
      authMode: "password",
      password: remote.password,
      proxyUrl: remote.proxyUrl ?? null,
    },
  });
  const project = await authenticatedFetch<ProjectRecord>(page, {
    url: "/api/projects",
    method: "POST",
    body: {
      hostId: host.id,
      name: `mobile-longpress-project-${Date.now()}`,
      remotePath: remote.projectPath,
    },
  });
  return { host, project };
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function longPress(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  const clientX = box!.x + box!.width / 2;
  const clientY = box!.y + box!.height / 2;
  await locator.dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    button: 0,
    clientX,
    clientY,
  });
  await page.waitForTimeout(700);
  await locator.dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    button: 0,
    clientX,
    clientY,
  });
}
