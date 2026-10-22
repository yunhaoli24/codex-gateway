import { expect, test } from "./fixtures/remote-workspace";
import { openApp, reloadApp, resetGatewayConfig } from "./helpers/app";
import { addRemoteHost, execRemoteSsh, sendSteerText } from "./helpers/remote-codex";
import { AGENT_OUTPUT_TIMEOUT_MS } from "./helpers/timeouts";

test("shares a remote conversation across two accounts, including steer and browser reload", async ({
  browser,
  page,
  remoteWorkspace,
}) => {
  test.setTimeout(8 * 60_000);
  await openApp(page, { interceptRealtime: false });
  const { project } = await remoteWorkspace.provision();
  const threadId = await remoteWorkspace.startThread(project.remotePath);
  const marker = `collaboration-${Date.now()}`;
  const promptTitle = `执行下面的 Shell 命令，然后只回复 ${marker}：`;
  const prompt = `${promptTitle}\nprintf 'collaboration running\\n'; sleep 45`;
  await page.getByPlaceholder("输入后续修改要求").fill(prompt);
  await page.getByTestId("send-turn-button").click();
  await expect(page.getByTestId("command-status-running")).toBeVisible({
    timeout: AGENT_OUTPUT_TIMEOUT_MS,
  });

  const context = await browser.newContext();
  const collaborator = await context.newPage();
  let configured = false;
  try {
    await collaborator.goto("/");
    await collaborator.getByTestId("login-username").fill("e2e-collaborator");
    await collaborator.getByTestId("login-password").fill("codex-gateway-collaborator-password");
    await collaborator.getByTestId("login-submit").click();
    await expect(collaborator.getByTestId("login-form")).toBeHidden();
    await openApp(collaborator, { interceptRealtime: false });
    const alias = await addRemoteHost(collaborator, remoteWorkspace.remote, "Collaborator host");
    configured = true;
    await collaborator.goto(`/?hostId=${alias.id}&threadId=${threadId}`);
    await expect(collaborator.getByTestId("chat-scroll-area").getByText(promptTitle)).toBeVisible({
      timeout: AGENT_OUTPUT_TIMEOUT_MS,
    });

    // Both accounts use real SSH authentication, but must not open two app-server proxy sockets.
    const proxies = await execRemoteSsh(
      remoteWorkspace.remote,
      'ps -eo args= | awk \'$2 == "app-server" && $3 == "proxy" {n++} END {print n+0}\'',
    );
    expect(proxies.stdout.trim()).toBe("1");

    const steer = `追加要求：${marker}-steer`;
    await sendSteerText(collaborator, `${marker}-steer`);
    await expect(
      page.getByTestId("chat-scroll-area").getByText(steer, { exact: true }),
    ).toBeVisible({ timeout: AGENT_OUTPUT_TIMEOUT_MS });
    await expect(collaborator.getByTestId("send-turn-button")).toHaveAttribute(
      "aria-label",
      "已完成",
      {
        timeout: AGENT_OUTPUT_TIMEOUT_MS,
      },
    );
    await reloadApp(page);
    await expect(
      page.getByTestId("chat-scroll-area").getByText(steer, { exact: true }),
    ).toBeVisible();
    await reloadApp(collaborator);
    await expect(collaborator.getByTestId("chat-scroll-area").getByText(promptTitle)).toBeVisible();

    const nextPromptTitle = `执行下面的 Shell 命令，然后只回复 ${marker}-next：`;
    const nextPrompt = `${nextPromptTitle}\nprintf 'collaboration continuing\\n'; sleep 12`;
    await collaborator.getByPlaceholder("输入后续修改要求").fill(nextPrompt);
    await collaborator.getByTestId("send-turn-button").click();
    await expect(page.getByTestId("chat-scroll-area").getByText(nextPromptTitle)).toBeVisible({
      timeout: AGENT_OUTPUT_TIMEOUT_MS,
    });
    await expect(collaborator.getByTestId("command-status-running")).toBeVisible({
      timeout: AGENT_OUTPUT_TIMEOUT_MS,
    });
    // Removing the original Host must release only its lease, including when that account's
    // SSH transport carries the shared RPC. The other authenticated account keeps receiving it.
    await resetGatewayConfig(page);
    await page.close();
    await expect(
      collaborator.getByTestId("chat-scroll-area").getByText(`${marker}-next`, { exact: true }),
    ).toBeVisible({ timeout: AGENT_OUTPUT_TIMEOUT_MS });
  } finally {
    if (configured) await resetGatewayConfig(collaborator);
    await context.close();
  }
});
