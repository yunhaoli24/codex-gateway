import { expect, test } from "./fixtures/remote-workspace";
import { openApp } from "./helpers/app";
import { addRemoteHost, execRemoteSsh, readMfaRemoteEnv } from "./helpers/remote-codex";
import { quote } from "shell-quote";
import { z } from "zod";
import {
  confirmHostDaemonRestart,
  openHostDaemonRestartDialog,
  readDaemonPid,
} from "./helpers/host-daemon";

const mfaRequestSchema = z.object({ type: z.literal("host.mfa.request"), hostId: z.number() });

test("discovers MFA through SSH and reconnects only after sidebar action", async ({ page }) => {
  test.setTimeout(120_000);
  const remote = await readMfaRemoteEnv();
  const challenges = new Map<number, number>();
  // Observe the browser's real WebSocket without routing or manufacturing protocol messages.
  // A fresh challenge proves the interrupted SSH attempt was replaced before entering the code.
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      const request = mfaRequestSchema.safeParse(JSON.parse(payload));
      if (request.success) {
        const hostId = request.data.hostId;
        challenges.set(hostId, (challenges.get(hostId) ?? 0) + 1);
      }
    });
  });
  await openApp(page, { interceptRealtime: false });

  const host = await addRemoteHost(page, remote, `mfa-${Date.now()}`, {
    waitForConnection: false,
  });

  const hostRow = page.getByTestId(`host-button-${host.id}`);
  const mfaButton = page.getByTestId(`host-mfa-button-${host.id}`);
  await expect(mfaButton).toBeVisible({ timeout: 60_000 });
  await mfaButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const previousChallenges = challenges.get(host.id) ?? 0;
  // Drop only the fixture's unauthenticated SSH child, leaving sshd and the authenticated
  // control connection alive. This exercises a real network loss followed by an MFA retry.
  await execRemoteSsh(
    remote,
    `printf '%s\\n' ${quote([remote.mfaCode ?? remote.password])} | sudo -S pkill -KILL -f '^sshd: .+ \\[net\\]$'`,
  );
  await expect.poll(() => challenges.get(host.id) ?? 0).toBeGreaterThan(previousChallenges);
  await page.getByLabel(/验证码|Verification code/).fill(remote.mfaCode ?? "123456");
  await page.getByRole("button", { name: /提交|Submit/ }).click();
  await expect(hostRow.getByLabel(/已连接|Connected/)).toBeVisible({ timeout: 60_000 });

  const previousPid = await readDaemonPid(remote);
  const previousChallengeCount = challenges.get(host.id) ?? 0;
  await openHostDaemonRestartDialog(page, host.id);
  await confirmHostDaemonRestart(page, host.name);
  expect(await readDaemonPid(remote)).not.toBe(previousPid);
  // Restart only the daemon over the authenticated Gateway SSH session. Asking for another
  // verification code here would indicate that restart accidentally tore down that shared session.
  expect(challenges.get(host.id) ?? 0).toBe(previousChallengeCount);
  await expect(
    hostRow.getByLabel(/已连接.*Codex app-server|Connected to Codex app-server/),
  ).toBeVisible();
});
