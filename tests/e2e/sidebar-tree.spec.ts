import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import { seedGatewayThread } from "./helpers/gateway-store";

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
