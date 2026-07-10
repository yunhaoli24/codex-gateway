import { expect, test } from "@playwright/test";
import { authenticatedFetch, openApp } from "./helpers/app";

test("rejects a stale full config save from another browser tab", async ({ browser, page }) => {
  await openApp(page);
  const secondContext = await browser.newContext({
    storageState: await page.context().storageState(),
  });
  const secondPage = await secondContext.newPage();

  try {
    await openApp(secondPage, { resetConfig: false });
    const firstConfig = await authenticatedFetch<any>(page, { url: "/api/config/export" });
    const firstGroup = `first-tab-${Date.now()}`;
    await authenticatedFetch(page, {
      url: "/api/config/sync",
      method: "POST",
      body: {
        ...firstConfig,
        notifications: {
          bark: {
            ...firstConfig.notifications.bark,
            group: firstGroup,
          },
        },
      },
    });

    await secondPage.getByTestId("settings-toggle").click();
    await secondPage.getByRole("tab", { name: "通知" }).click();
    await secondPage.getByLabel("Bark 分组").fill("stale-second-tab");
    await secondPage.getByRole("button", { name: "保存通知设置" }).click();
    await expect(
      secondPage
        .getByTestId("settings-panel")
        .getByText("配置已在其他标签页中发生变化，请刷新页面后重试"),
    ).toBeVisible();

    const preservedConfig = await authenticatedFetch<any>(page, { url: "/api/config/export" });
    expect(preservedConfig.notifications.bark.group).toBe(firstGroup);
  } finally {
    await secondContext.close();
  }
});
