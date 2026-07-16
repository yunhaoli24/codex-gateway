import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import { configureBarkNotifications, useBarkReceiver } from "./helpers/bark";
import {
  addRemoteHost,
  addRemoteProject,
  readRemoteEnv,
  sendTextTurn,
  startRemoteThreadFromProjectMenu,
} from "./helpers/remote-codex";
import { sendRealtimeRequest } from "./helpers/realtime";

test("Bark sends ordinary turn notifications and only notifies when an app-server goal ends", async ({
  page,
}) => {
  const bark = await useBarkReceiver();
  const remote = await readRemoteEnv();
  await openApp(page);
  await configureBarkNotifications(page, bark.url);

  const host = await addRemoteHost(page, remote, `bark-notification-host-${Date.now()}`);
  const project = await addRemoteProject(page, remote, host.id);
  const threadId = await startRemoteThreadFromProjectMenu(page, project.id);

  await sendTextTurn(page, `E2E 普通通知 ${Date.now()}`);
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 120_000,
  });
  await expect.poll(async () => (await bark.readRequests()).length, { timeout: 30_000 }).toBe(1);
  expect((await bark.readRequests())[0]?.title).toContain("回合已结束");
  const turnToast = page.locator("[data-sonner-toast]").filter({ hasText: "回合已结束" });
  await expect(turnToast).toBeVisible();
  await turnToast.getByRole("button", { name: "打开会话" }).click();
  await expect(page).toHaveURL(new RegExp(`threadId=${threadId}`));

  await sendRealtimeRequest(page, {
    type: "thread.goal.set",
    requestId: `goal-active-${Date.now()}`,
    hostId: host.id,
    threadId,
    objective: "验证 Bark 只在目标整体结束时通知",
    tokenBudget: null,
  });
  await expect(page.getByTestId("composer-mode-strip").getByText("目标").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(2_000);
  expect(await bark.readRequests()).toHaveLength(1);

  await sendRealtimeRequest(page, {
    type: "thread.goal.set",
    requestId: `goal-complete-${Date.now()}`,
    hostId: host.id,
    threadId,
    status: "complete",
  });
  await expect.poll(async () => (await bark.readRequests()).length, { timeout: 30_000 }).toBe(2);
  const requests = await bark.readRequests();
  expect(requests[1]?.title).toContain("目标已结束");
  expect(requests[1]?.body).toContain("推进");
  expect(requests[1]?.body).toContain("tokens");
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "目标已结束" })).toBeVisible();
});
