import { expect, test } from "./fixtures/remote-workspace";
import { openApp, reloadApp } from "./helpers/app";
import { AGENT_OUTPUT_TIMEOUT_MS } from "./helpers/timeouts";
import { selectSidebarThread } from "./helpers/remote-codex";

test("configures a remote model provider and forks a conversation from message actions", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page, { interceptRealtime: false });
  const { project } = await remoteWorkspace.provision();
  const originalThread = await remoteWorkspace.startThread(project.remotePath);
  const composer = page.getByPlaceholder("输入后续修改要求");
  await composer.fill("/provider");
  await page.getByTestId("slash-command-provider").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /模型供应商/ })).toBeVisible();
  await dialog.getByRole("button", { name: "添加网关" }).click();
  const providerName = `CloudAwn ${Date.now()}`;
  await dialog.getByLabel("名称", { exact: true }).fill(providerName);
  await dialog.getByLabel("API 地址").fill("https://api.cloudawn.top/v1");
  await dialog.getByLabel("API Key 环境变量名称").fill("OPENAI_API_KEY");
  await dialog.getByRole("button", { name: "保存配置" }).click();
  const providerCard = dialog
    .locator("div.rounded-lg", { has: page.getByText(providerName, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "编辑", exact: true }) });
  await expect(providerCard).toBeVisible();
  await providerCard.getByRole("button", { name: "编辑", exact: true }).click();
  await dialog.getByLabel("名称", { exact: true }).fill(`${providerName} updated`);
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await expect(dialog.getByText(`${providerName} updated`, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await reloadApp(page);
  await composer.fill("/provider");
  await page.getByTestId("slash-command-provider").click();
  await expect(dialog.getByText(`${providerName} updated`, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // Provider configuration does not switch the existing thread. It still performs a real turn
  // with its saved provider, then forks at the two boundaries supported by App Server.
  const text = `请只回复：fork-ready-${Date.now()}`;
  await composer.fill(text);
  await page.getByTestId("send-turn-button").click();
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: AGENT_OUTPUT_TIMEOUT_MS,
  });
  await page.getByTestId("message-fork").last().click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("threadId"))
    .not.toBe(originalThread);
  await expect(page.locator(".thread-user-message", { hasText: text })).toBeVisible();

  await selectSidebarThread(page, originalThread);
  await page.getByTestId("message-fork").first().click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("threadId"))
    .not.toBe(originalThread);
  await expect(composer).toHaveAttribute("data-value", text);
  await selectSidebarThread(page, originalThread);
  await expect(page.locator(".thread-user-message", { hasText: text })).toBeVisible();
  await expect(composer).toHaveAttribute("data-value", "");
});
