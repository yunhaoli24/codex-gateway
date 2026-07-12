import { expect, test } from "@playwright/test";
import { openApp, reloadApp } from "./helpers/app";
import { addRemoteHost, readRemoteEnv } from "./helpers/remote-codex";

test("opens a real remote HTTP and WebSocket service through the SSH preview proxy", async ({
  page,
}) => {
  const remote = await readRemoteEnv();
  await openApp(page);
  await addRemoteHost(page, remote, `preview-host-${Date.now()}`);

  await page.getByTestId("open-browser-button").click();
  await page.getByPlaceholder("http://localhost:3000").fill("http://localhost:4173");
  await page.getByTestId("browser-open-submit").click();
  await expect(page.getByRole("tab", { name: "localhost:4173" })).toBeVisible({ timeout: 5_000 });

  const preview = page.frameLocator('iframe[title="localhost:4173"]');
  await expect(preview.getByRole("heading", { name: "remote-preview-page" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(preview.locator("#http")).toHaveText("remote-preview-http-ok");
  await expect(preview.locator("#ws")).toHaveText("remote-preview-websocket");

  await reloadApp(page);
  await page.getByRole("tab", { name: "localhost:4173" }).click();
  await expect(preview.getByRole("heading", { name: "remote-preview-page" })).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByRole("tab", { name: "localhost:4173" })
    .getByLabel(/关闭标签页|Close tab/)
    .click();
  await expect(page.getByRole("tab", { name: "localhost:4173" })).toBeHidden();
});
