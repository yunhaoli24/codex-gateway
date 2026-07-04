import { expect, test, type Locator, type Page } from "@playwright/test";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { readRemoteEnv, waitForSelectedThreadId } from "./helpers/remote-codex";

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
  const panel = page.getByTestId("subagent-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Mobile subagent timeline is readable.")).toBeVisible();
  const panelBox = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(panelBox?.width).toBeGreaterThan((viewport?.width ?? 0) * 0.9);
  await page.getByLabel("关闭子代理面板").click();
  await expect(panel).toBeHidden();
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
  const host = await authenticatedFetch<{ id: number }>(page, {
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
  const project = await authenticatedFetch<{ id: number }>(page, {
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
