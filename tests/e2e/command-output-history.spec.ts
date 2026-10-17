import { expect, test } from "./fixtures/remote-workspace";
import { openApp } from "./helpers/app";
import { AGENT_OUTPUT_TIMEOUT_MS } from "./helpers/timeouts";

test("browses earlier persisted command output", async ({ page, remoteWorkspace }) => {
  await openApp(page, { interceptRealtime: false });
  const { project } = await remoteWorkspace.provision();
  await remoteWorkspace.startThread(project.remotePath);

  // Generate more than the browser's retained tail through Codex's real command tool. Codex caps
  // persisted output itself, so the detail read may replace the tail with a smaller head/tail
  // summary. Assert the visible content, not that local window controls must remain afterwards.
  await page
    .getByPlaceholder("输入后续修改要求")
    .fill(
      "请执行这一条命令一次：awk 'BEGIN { for (i=1; i<=6000; i++) printf \"output-%05d abcdefghijklmnopqrstuvwxyz\\n\", i }'。不需要完整阅读输出，执行后只回复“输出完成”。",
    );
  await page.getByTestId("send-turn-button").click();
  const command = page.getByRole("button", { name: /awk.*6000/ }).first();
  await expect(command).toBeVisible({ timeout: AGENT_OUTPUT_TIMEOUT_MS });
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: AGENT_OUTPUT_TIMEOUT_MS,
  });

  const intermediate = page.getByRole("button", { name: /中间过程/ }).first();
  await intermediate.click();
  await command.click();
  const earlier = page.getByTestId("load-earlier-command-output");
  await expect(earlier).toBeVisible();
  await earlier.click();
  await expect(page.getByText(/output-00001 abcdefghijklmnopqrstuvwxyz/)).toBeVisible();

  await expect(page.getByText(/output-06000 abcdefghijklmnopqrstuvwxyz/)).toBeVisible();
});
