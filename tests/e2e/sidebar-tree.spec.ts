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
