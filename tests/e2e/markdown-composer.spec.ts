import { expect, test } from "./fixtures/remote-workspace";
import { openApp } from "./helpers/app";
import { selectSidebarThread } from "./helpers/remote-codex";
import { AGENT_OUTPUT_TIMEOUT_MS } from "./helpers/timeouts";

// Native clipboard APIs require a secure context. Loopback is trustworthy in Chromium;
// the nip.io origin used by preview-proxy tests is intentionally plain HTTP.
test.use({ baseURL: "http://127.0.0.1:3100" });

test("edits Markdown in place, sends it, and copies formatted timeline selections as Markdown", async ({
  page,
  context,
  remoteWorkspace,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page);
  const { project } = await remoteWorkspace.provision({ hostName: `markdown-${Date.now()}` });
  const threadId = await remoteWorkspace.startThread(project.remotePath);
  await selectSidebarThread(page, threadId);
  const composer = page.getByTestId("composer-input");

  await composer.pressSequentially("## Markdown 编辑");
  await expect(composer.locator("h2")).toHaveText("Markdown 编辑");
  const markdown = [
    "## Markdown 编辑",
    "",
    "**重点内容**、[文档](https://example.com/docs)，公式 $x^2$。",
    "",
    "```ts",
    "const answer = 42;",
    "```",
    "",
    "请只回复 MARKDOWN_RECEIVED。",
  ].join("\n");
  await page.evaluate((text) => navigator.clipboard.writeText(text), markdown);
  await composer.fill("");
  await composer.press("ControlOrMeta+V");
  await expect(composer.locator("h2")).toHaveText("Markdown 编辑");
  await expect(composer.locator("strong")).toHaveText("重点内容");
  await expect(composer.locator("pre code")).toContainText("const answer = 42;");
  await expect(composer).toHaveAttribute("data-value", /\$x\^2\$/);
  await page.getByTestId("send-turn-button").click();
  const message = page
    .locator(".thread-user-message .markdown-content")
    .filter({ hasText: "Markdown 编辑" });
  await expect(message.locator("strong")).toHaveText("重点内容");
  await expect(message.locator(".katex")).toBeVisible();
  await expect(
    page
      .locator(".is-assistant .markdown-content")
      .filter({ hasText: "MARKDOWN_RECEIVED" })
      .first(),
  ).toBeVisible({ timeout: AGENT_OUTPUT_TIMEOUT_MS });

  await message.scrollIntoViewIfNeeded();
  await message.click();
  await message.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await page.keyboard.press("ControlOrMeta+C");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("## Markdown 编辑");
  expect(copied).toContain("**重点内容**");
  expect(copied).toContain("[文档](https://example.com/docs)");
  expect(copied).toMatch(/```(?:ts|typescript)\n/);
  expect(copied).toContain("$x^2$");

  await message.locator("strong").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await page.keyboard.press("ControlOrMeta+C");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("**重点内容**");
});
