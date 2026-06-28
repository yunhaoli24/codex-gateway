import { expect, test, type Locator, type Page } from "@playwright/test";
import { openApp, reloadApp } from "./helpers/app";
import { readRemoteEnv } from "./helpers/remote-codex";

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
  const startResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/threads/start") && response.request().method() === "POST",
  );
  await page.getByRole("menuitem", { name: /新建/ }).click();
  const startResult = await (await startResponsePromise).json();
  const threadId = String(startResult.thread.id);

  await page.getByTestId("mobile-sidebar-toggle").click();
  await page.getByTestId(`project-button-${project.id}`).click();
  await expect(page.getByTestId("project-thread-list")).toBeVisible();
  const threadButton = page.getByTestId(`project-thread-row-${threadId}`);
  await expect(threadButton).toBeVisible({ timeout: 30_000 });

  await longPress(page, threadButton);
  await page.getByRole("menuitem", { name: /置顶/ }).click();
  await page.getByTestId("mobile-sidebar-toggle").click();
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toBeVisible();
});

async function createConfiguredHostAndProject(
  page: Page,
  remote: Awaited<ReturnType<typeof readRemoteEnv>>,
) {
  const host = (await page.evaluate(
    async ({ remote }) => {
      const response = await fetch("/api/hosts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `mobile-longpress-host-${Date.now()}`,
          sshHost: remote.host,
          username: remote.username,
          port: Number(remote.port),
          authMode: "password",
          password: remote.password,
          proxyUrl: remote.proxyUrl ?? null,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return await response.json();
    },
    { remote },
  )) as { id: number };
  const project = (await page.evaluate(
    async ({ hostId, remote }) => {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hostId,
          name: `mobile-longpress-project-${Date.now()}`,
          remotePath: remote.projectPath,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return await response.json();
    },
    { hostId: host.id, remote },
  )) as { id: number };
  await page.evaluate((hostRecord) => {
    localStorage.setItem(
      "codex-gateway-config",
      JSON.stringify({
        version: 1,
        hosts: [hostRecord],
        pinnedThreads: [],
        lastOpenThread: null,
      }),
    );
  }, host);
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
