import { expect, test } from "./fixtures/remote-workspace";
import { openApp, reloadApp } from "./helpers/app";
import { startExternalCodexTurn } from "./helpers/external-codex";
import { AGENT_OUTPUT_TIMEOUT_MS } from "./helpers/timeouts";
import { sendTextTurn } from "./helpers/remote-codex";

test("views a thread owned by another client and retries after that client closes", async ({
  page,
  remoteWorkspace,
}) => {
  await openApp(page, { interceptRealtime: false });
  const { host } = await remoteWorkspace.provision();
  const prompt = "请执行 sleep 180，等命令结束后回复完成。";
  const external = await startExternalCodexTurn(remoteWorkspace.remote, prompt);
  try {
    await expect.poll(external.threadId, { timeout: AGENT_OUTPUT_TIMEOUT_MS }).not.toBeNull();
    const threadId = external.threadId()!;
    await page.goto(`/?hostId=${host.id}&threadId=${threadId}`);
    const notice = page.getByTestId("thread-read-only-notice");
    await expect(notice).toBeVisible();
    await expect(
      page.getByTestId("chat-scroll-area").getByText(prompt, { exact: true }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("输入后续修改要求")).toBeHidden();

    // Retrying while the original client is still open must remain a usable read-only view.
    await page.getByTestId("retry-thread-writer").click();
    await expect(page.getByTestId("retry-thread-writer")).toBeEnabled();
    await expect(notice).toBeVisible();
    await reloadApp(page);
    await expect(notice).toBeVisible();

    await external.stop();
    await page.getByTestId("retry-thread-writer").click();
    await expect(notice).toBeHidden();
    await expect(page.getByPlaceholder("输入后续修改要求")).toBeEnabled();
    await sendTextTurn(page, "已切换到网页继续对话");
    await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
      timeout: AGENT_OUTPUT_TIMEOUT_MS,
    });
  } finally {
    await external.stop();
  }
});
