import { expect, test } from "@playwright/test";
import { openApp, reloadApp } from "./helpers/app";

test("keeps German settings readable on mobile and restores the saved language", async ({
  page,
}) => {
  await openApp(page, { interceptRealtime: false });
  await page.getByTestId("mobile-sidebar-toggle").click();
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("tab", { name: "外观", exact: true }).click();
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Deutsch", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Einstellungen", exact: true })).toBeVisible();
  await expect(page.getByTestId("settings-close-button")).toHaveAccessibleName("Schließen");
  await page.getByRole("tab", { name: "Benachrichtigungen", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Web-Benachrichtigungen aktivieren", exact: true }),
  ).toBeVisible();

  const dialog = page.getByTestId("settings-dialog");
  expect(
    await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null)
    throw new Error("German settings dialog has no viewport bounds");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

  await reloadApp(page);
  await page.getByTestId("mobile-sidebar-toggle").click();
  await expect(page.getByTestId("settings-toggle")).toHaveText("Einstellungen");
});
