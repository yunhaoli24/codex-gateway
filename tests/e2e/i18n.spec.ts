import { expect, test } from "@playwright/test";
import { authenticatedFetch, openApp } from "./helpers/app";

test("requires bearer auth for protected HTTP APIs", async ({ page }) => {
  await openApp(page);
  const unauthorized = await page.evaluate(async () => {
    const response = await fetch("/api/config/export");
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => null),
    };
  });
  expect(unauthorized.ok).toBe(false);
  expect(unauthorized.status).toBe(401);

  const config = await authenticatedFetch<{ version: number }>(page, {
    url: "/api/config/export",
  });
  expect(config.version).toBe(1);
});

test("defaults to Chinese and can switch to English", async ({ page }) => {
  await openApp(page);
  await expect(page.getByText("设置")).toBeVisible();
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "English" }).click();
  await expect(page.getByText("Settings")).toBeVisible();
});

test("config JSON editor scrolls to the bottom inside settings", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("settings-toggle").click();
  await page.getByTestId("settings-panel").getByRole("button", { name: "查看配置" }).click();
  const textarea = page.getByTestId("config-json-textarea");
  const largeConfig = JSON.stringify(
    {
      version: 1,
      hosts: Array.from({ length: 80 }, (_, index) => ({
        id: index + 1,
        name: `host-${index}`,
        sshHost: `host-${index}.example.test`,
        username: "codex",
        port: 22,
        authMode: "password",
        password: "redacted",
        proxyUrl: null,
        hasPassword: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
      pinnedThreads: [],
      lastOpenThread: null,
    },
    null,
    2,
  );
  await textarea.fill(largeConfig);
  await textarea.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(async () =>
      textarea.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThan(4);
});
