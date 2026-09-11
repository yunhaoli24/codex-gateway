import { expect, test } from "./fixtures/remote-workspace";
import { openApp } from "./helpers/app";
import { addRemoteHost, readMfaRemoteEnv } from "./helpers/remote-codex";

test("discovers MFA through SSH and reconnects only after sidebar action", async ({ page }) => {
  test.setTimeout(120_000);
  const remote = await readMfaRemoteEnv();
  await openApp(page);

  const host = await addRemoteHost(page, remote, `mfa-${Date.now()}`, {
    waitForConnection: false,
  });

  const hostRow = page.getByTestId(`host-button-${host.id}`);
  const mfaButton = page.getByTestId(`host-mfa-button-${host.id}`);
  await expect(mfaButton).toBeVisible({ timeout: 60_000 });
  await mfaButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel(/验证码|Verification code/).fill(remote.mfaCode ?? "123456");
  await page.getByRole("button", { name: /提交|Submit/ }).click();
  await expect(hostRow.getByLabel(/已连接|Connected/)).toBeVisible({ timeout: 60_000 });
});
