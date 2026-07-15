import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import { installRealtimeThreadSnapshotMock, seedGatewayThread } from "./helpers/gateway-store";

test("collapses the desktop sidebar and restores the saved layout", async ({ page }) => {
  await openApp(page);

  const sidebarGap = page.locator('[data-slot="sidebar-gap"]');
  await expect(page.locator('[data-slot="sidebar"][data-state="expanded"]')).toBeVisible();
  await page.getByTestId("desktop-sidebar-collapse").click();
  await expect.poll(() => sidebarGap.evaluate((element) => element.clientWidth)).toBe(0);
  await expect(page.getByTestId("desktop-sidebar-expand")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("desktop-sidebar-expand")).toBeVisible();
  await expect.poll(() => sidebarGap.evaluate((element) => element.clientWidth)).toBe(0);

  await page.getByTestId("desktop-sidebar-expand").click();
  await expect.poll(() => sidebarGap.evaluate((element) => element.clientWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId("desktop-sidebar-collapse")).toBeVisible();
});

test("toggles an expanded project closed from the desktop sidebar", async ({ page }) => {
  await openApp(page);
  await seedGatewayThread(page, {
    hostId: 101,
    projectId: null,
    host: { id: 101, name: "Toggle Host", sshHost: "localhost", sshUser: "codex" },
    project: { id: 201, hostId: 101, name: "Toggle Project", remotePath: "/workspace/toggle" },
    threads: [
      {
        id: "toggle-thread",
        title: "Toggle Thread",
        pinned: false,
        updatedAt: new Date().toISOString(),
      },
    ],
  });
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    store.selectProject = async (projectId: number) => {
      store.selectedProjectId = projectId;
      store.selectedThreadId = null;
    };
  });

  await expect(page.getByTestId("desktop-layout")).toBeVisible();
  await expect(page.getByTestId("project-button-201")).toBeVisible();
  await page.getByTestId("project-button-201").click();
  await expect(page.getByTestId("thread-button-toggle-thread")).toBeVisible();

  await page.getByTestId("project-button-201").click();
  await expect(page.getByTestId("thread-button-toggle-thread")).toBeHidden();
});

test("marks completed threads as needing review until they are opened", async ({ page }) => {
  await openApp(page);
  await seedGatewayThread(page, {
    hostId: 102,
    projectId: 202,
    threadId: "selected-thread",
    host: { id: 102, name: "Review Host", sshHost: "localhost", sshUser: "codex" },
    project: { id: 202, hostId: 102, name: "Review Project", remotePath: "/workspace/review" },
    currentThread: { id: "selected-thread", name: "Selected Thread" },
    threads: [
      {
        id: "review-thread",
        name: "Review Thread",
        pinned: false,
        updatedAt: Math.floor(Date.now() / 1000),
      },
      {
        id: "selected-thread",
        name: "Selected Thread",
        pinned: false,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    ],
    status: "completed",
  });
  await installRealtimeThreadSnapshotMock(page, {
    hostId: 102,
    snapshots: {
      "review-thread": {
        thread: { id: "review-thread", name: "Review Thread" },
        history: { thread: { id: "review-thread", turns: [] } },
        projectId: 202,
        runtimeStatus: "completed",
      },
    },
  });
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    store.setThreadStatus(102, "review-thread", "running");
    store.setThreadStatus(102, "review-thread", "completed");
  });

  await expect(page.getByTestId("thread-button-review-thread")).toBeVisible();
  await expect(
    page.getByTestId("thread-button-review-thread").getByLabel("已完成，待查看", { exact: true }),
  ).toBeVisible();

  await page.getByTestId("thread-button-review-thread").click();
  await expect(
    page.getByTestId("thread-button-review-thread").getByLabel("已完成", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("thread-button-review-thread").getByLabel("已完成，待查看", { exact: true }),
  ).toBeHidden();
});

test("keeps non-pinned main threads in recent activity for the page session", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const gateway = pinia?._s?.get("gateway");
    const activity = pinia?._s?.get("gateway-thread-activity");
    if (!gateway || !activity) throw new Error("Unable to locate sidebar activity stores");

    const host = {
      id: 104,
      name: "Activity Host",
      sshHost: "activity.example.internal",
      username: "codex",
    };
    const project = {
      id: 204,
      hostId: host.id,
      name: "Activity Project",
      remotePath: "/workspace/activity",
    };
    gateway.hosts = [host];
    gateway.projects = [project];
    gateway.gatewayConfig.pinnedThreads = [
      {
        hostId: host.id,
        projectId: project.id,
        threadId: "already-pinned",
        title: "Already pinned",
      },
    ];
    activity.ingestThreads(
      host.id,
      [
        {
          id: "recent-main",
          title: "Recent main thread",
          projectId: project.id,
          cwd: project.remotePath,
          updatedAt: 3,
        },
        {
          id: "already-pinned",
          title: "Already pinned",
          projectId: project.id,
          updatedAt: 2,
        },
        {
          id: "spawned-child",
          title: "Spawned child",
          projectId: project.id,
          parentThreadId: "recent-main",
          updatedAt: 1,
        },
      ],
      [project],
    );
    gateway.setThreadStatus(host.id, "recent-main", "running");
    gateway.setThreadStatus(host.id, "already-pinned", "running");
    gateway.setThreadStatus(host.id, "spawned-child", "running");
    gateway.setThreadStatus(host.id, "recent-main", "completed");
  });

  await expect(page.getByText("最近运行", { exact: true })).toBeVisible();
  await expect(page.getByTestId("recent-thread-button-recent-main")).toBeVisible();
  await expect(page.getByTestId("recent-thread-button-already-pinned")).toBeHidden();
  await expect(page.getByTestId("recent-thread-button-spawned-child")).toBeHidden();

  const sectionOrder = await page.getByTestId("sidebar-scroll-area").evaluate((root) => {
    const text = root.textContent ?? "";
    return [text.indexOf("已固定"), text.indexOf("最近运行"), text.indexOf("主机")];
  });
  expect(sectionOrder[0]).toBeLessThan(sectionOrder[1]!);
  expect(sectionOrder[1]).toBeLessThan(sectionOrder[2]!);
});

test("long expanded tree labels truncate without displacing trailing statuses", async ({
  page,
}) => {
  await openApp(page);
  const hostId = 103;
  const projectId = 203;
  const threadId = "long-sidebar-thread";
  const longTitle = `Long thread ${"unbroken-segment-".repeat(18)}`;
  await seedGatewayThread(page, {
    hostId,
    projectId,
    threadId: null,
    host: {
      id: hostId,
      name: `Long host ${"host-segment-".repeat(12)}`,
      sshHost: "very-long-hostname.example.internal",
      sshUser: "codex",
    },
    project: {
      id: projectId,
      hostId,
      name: `Long project ${"project-segment-".repeat(12)}`,
      remotePath: "/workspace/sidebar-layout",
    },
    threads: [{ id: threadId, name: longTitle, pinned: false, updatedAt: 1 }],
  });
  await installRealtimeThreadSnapshotMock(page, {
    hostId,
    snapshots: {
      [threadId]: {
        thread: { id: threadId, name: longTitle },
        history: { thread: { id: threadId, turns: [] } },
        projectId,
        runtimeStatus: "running",
      },
    },
  });
  await page.evaluate(
    ({ hostId, threadId }) => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
      store.hostConnectionStatuses = { [hostId]: { status: "connected" } };
      store.setThreadStatus(hostId, threadId, "running");
    },
    { hostId, threadId },
  );

  await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible();
  await page.getByTestId(`thread-button-${threadId}`).click();
  await expect(page.getByTestId(`thread-button-${threadId}`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  await expect(page.getByTestId(`host-button-${hostId}`).getByLabel("已连接")).toBeVisible();
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("运行中")).toBeVisible();

  const metrics = await page.getByTestId("sidebar-scroll-area").evaluate(
    (root, { hostId, threadId, longTitle }) => {
      const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      const threadButton = root.querySelector<HTMLElement>(
        `[data-testid="thread-button-${CSS.escape(threadId)}"]`,
      );
      const title = threadButton?.querySelector<HTMLElement>(`[title="${CSS.escape(longTitle)}"]`);
      const hostStatus = root.querySelector<HTMLElement>(
        `[data-testid="host-button-${hostId}"] [aria-label="已连接"]`,
      );
      const threadStatus = threadButton?.querySelector<HTMLElement>('[aria-label="运行中"]');
      const statuses = [hostStatus, threadStatus];
      if (!viewport || !title || statuses.some((status) => !status)) {
        throw new Error("Missing sidebar layout nodes");
      }
      const viewportRect = viewport.getBoundingClientRect();
      return {
        overflow: viewport.scrollWidth - viewport.clientWidth,
        titleClipped: title.scrollWidth > title.clientWidth,
        titleOverflow: getComputedStyle(title).textOverflow,
        statusesInside: statuses.every((status) => {
          if (!status) return false;
          const rect = status.getBoundingClientRect();
          return rect.left >= viewportRect.left && rect.right <= viewportRect.right;
        }),
      };
    },
    { hostId, threadId, longTitle },
  );
  expect(metrics).toEqual({
    overflow: 0,
    titleClipped: true,
    titleOverflow: "ellipsis",
    statusesInside: true,
  });
});
