import { expect, test } from "@playwright/test";
import { configureBarkNotifications, useBarkReceiver } from "./helpers/bark";
import { openApp, reloadApp } from "./helpers/app";
import {
  addRemoteHost,
  addRemoteProject,
  execRemoteSsh,
  readRemoteEnv,
  startRemoteThreadFromProjectMenu,
} from "./helpers/remote-codex";

test("monitors a real tmux pane, persists it, and notifies once when it returns to shell", async ({
  page,
}) => {
  const remote = await readRemoteEnv();
  const bark = await useBarkReceiver();
  const suffix = Date.now();
  const sessionName = `train-${suffix}`;
  const idleSessionName = `idle-${suffix}`;
  const backgroundSessionName = `background-${suffix}`;
  const directSessionName = `direct-${suffix}`;
  const explicitShellSessionName = `explicit-shell-${suffix}`;
  const outputMarker = `tmux-preview-${suffix}`;
  const hostName = `tmux-monitor-host-${suffix}`;

  await execRemoteSsh(
    remote,
    `
tmux kill-server >/dev/null 2>&1 || true
tmux new-session -d -s ${shellQuote(sessionName)} -n model
tmux send-keys -t ${shellQuote(`${sessionName}:0.0`)} ${shellQuote(`for i in $(seq 1 200); do printf 'training-line-%s\\n' "$i"; done; printf '${outputMarker}\\n'; sleep 300`)} Enter
tmux new-session -d -s ${shellQuote(idleSessionName)} -n shell
tmux new-session -d -s ${shellQuote(backgroundSessionName)} -n model
tmux send-keys -t ${shellQuote(`${backgroundSessionName}:0.0`)} ${shellQuote("sleep 300 &")} Enter
tmux new-session -d -s ${shellQuote(directSessionName)} -n proxy ${shellQuote("sleep 300")}
tmux new-session -d -s ${shellQuote(explicitShellSessionName)} -n shell /bin/bash
for i in $(seq 1 50); do
  [ "$(tmux display-message -p -t ${shellQuote(`${sessionName}:0.0`)} '#{pane_current_command}')" = sleep ] && break
  sleep 0.1
done
for i in $(seq 1 50); do
  pane_pid="$(tmux display-message -p -t ${shellQuote(`${backgroundSessionName}:0.0`)} '#{pane_pid}')"
  [ "$(tmux display-message -p -t ${shellQuote(`${backgroundSessionName}:0.0`)} '#{pane_current_command}')" = bash ] \
    && ps --ppid "$pane_pid" -o comm= | grep -qx sleep \
    && break
  sleep 0.1
done
`,
  );

  await openApp(page);
  await configureBarkNotifications(page, bark.url);
  const host = await addRemoteHost(page, remote, hostName);
  const project = await addRemoteProject(page, remote, host.id);
  await startRemoteThreadFromProjectMenu(page, project.id);

  await page.getByTestId("open-tmux-button").click();
  const panel = page.getByTestId("tmux-monitor-panel");
  await expect(panel).toBeVisible();
  const hostNode = panel.getByTestId(`tmux-host-node-${host.id}`);
  await expect(hostNode).toBeVisible();
  const runningPane = panel.getByTestId(`tmux-pane-${sessionName}-0-0`);
  const idlePane = panel.getByTestId(`tmux-pane-${idleSessionName}-0-0`);
  const backgroundPane = panel.getByTestId(`tmux-pane-${backgroundSessionName}-0-0`);
  const directPane = panel.getByTestId(`tmux-pane-${directSessionName}-0-0`);
  const explicitShellPane = panel.getByTestId(`tmux-pane-${explicitShellSessionName}-0-0`);
  await expect(runningPane).toContainText("sleep");
  await expect(idlePane.getByRole("button", { name: "已回到 Shell" })).toBeDisabled();
  // A background job leaves bash in the foreground but still owns the pane TTY. It must not
  // be conflated with the genuinely idle shell above.
  await expect(backgroundPane).toContainText("bash");
  await expect(backgroundPane.getByRole("button", { name: "加入监控" })).toBeEnabled();
  // A pane can start a process directly, so its root PGID is also the foreground PGID.
  // The root executable identity distinguishes it from an idle interactive shell.
  await expect(directPane).toContainText("sleep");
  await expect(directPane.getByRole("button", { name: "加入监控" })).toBeEnabled();
  // pane_start_command is non-empty for an explicitly started shell, but the system shell
  // registry still identifies it as a shell and allows the idle transition.
  await expect(explicitShellPane).toContainText("bash");
  await expect(explicitShellPane.getByRole("button", { name: "已回到 Shell" })).toBeDisabled();

  await runningPane.getByRole("button", { name: `查看 ${sessionName} Pane 输出` }).click();
  const paneOutput = page.getByTestId("tmux-pane-output");
  await expect(paneOutput).toContainText(outputMarker);
  await expect
    .poll(() =>
      paneOutput.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");

  const addMonitorButton = runningPane.getByRole("button", { name: "加入监控" });
  const monitorCreated = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/hosts/${host.id}/tmux/monitors`) &&
      response.request().method() === "POST",
  );
  await addMonitorButton.click();
  await expect(runningPane.getByTestId("tmux-monitor-adding-spinner")).toBeVisible();
  await monitorCreated;
  await expect(panel.getByText("监控中 · 1")).toBeVisible();
  await expect(page.getByTestId("open-tmux-button")).toContainText("1");
  const addedToast = page.locator("[data-sonner-toast]").filter({ hasText: "已开始监控" });
  await expect(addedToast).toContainText(sessionName);
  await expect(addedToast).toContainText(hostName);
  await expect(addedToast).not.toContainText("0.1");
  await panel
    .getByTestId(/^tmux-monitor-\d+$/)
    .getByRole("button", { name: `查看 ${sessionName} Pane 输出` })
    .click();
  await expect(page.getByTestId("tmux-pane-output")).toContainText(outputMarker);
  await page.keyboard.press("Escape");
  await runningPane.getByTestId(`view-monitored-tmux-pane-${sessionName}-0-0`).click();
  await expect(page.getByTestId("tmux-pane-output")).toContainText(outputMarker);
  await page.keyboard.press("Escape");

  await reloadApp(page);
  await expect(page.getByTestId("tmux-monitor-panel")).toBeVisible();
  await expect(page.getByTestId("tmux-monitor-panel").getByText("监控中 · 1")).toBeVisible();
  await expect(panel.getByTestId(`tmux-host-node-${host.id}`)).toBeVisible();

  await execRemoteSsh(remote, `tmux send-keys -t ${shellQuote(`${sessionName}:0.0`)} C-c`);
  await expect
    .poll(
      async () =>
        (
          await execRemoteSsh(
            remote,
            `tmux display-message -p -t ${shellQuote(`${sessionName}:0.0`)} '#{pane_current_command}'`,
          )
        ).stdout.trim(),
      { timeout: 10_000 },
    )
    .toMatch(/bash|zsh|sh/);

  await hostNode.getByRole("button", { name: /立即检查/ }).click();
  await expect(page.getByTestId("tmux-monitor-panel").getByText("已返回 Shell")).toBeVisible();
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Tmux 任务已结束" });
  await expect(toast).toBeVisible();
  await expect.poll(() => readTmuxNotifications(bark), { timeout: 30_000 }).toHaveLength(1);
  const completionNotification = (await readTmuxNotifications(bark))[0];
  expect(completionNotification?.title).toContain(hostName);
  expect(completionNotification?.title).toContain(sessionName);
  expect(completionNotification?.body).toContain(hostName);
  expect(completionNotification?.body).toContain(sessionName);
  expect(completionNotification?.body).toContain("Thread：");
  expect(completionNotification?.body).toContain("状态：已返回 Shell");
  expect(completionNotification?.body).not.toContain("0.0");

  await page.waitForTimeout(1_000);
  expect(await readTmuxNotifications(bark)).toHaveLength(1);

  await execRemoteSsh(
    remote,
    `tmux send-keys -t ${shellQuote(`${sessionName}:0.0`)} ${shellQuote("sleep 300")} Enter`,
  );
  await panel.getByRole("button", { name: "重新监控" }).click();
  await expect(panel.getByText("监控中 · 1")).toBeVisible();
  const activeMonitorCard = panel
    .getByRole("button", { name: "取消监控" })
    .locator("xpath=ancestor::article");
  await activeMonitorCard.getByRole("button", { name: "监控操作" }).click();
  await page.getByRole("menuitem", { name: "改为永久监控" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "改为永久监控" }).click();
  await expect(panel.getByText("永久监控 · 1")).toBeVisible();
  await panel.getByRole("button", { name: "取消永久监控" }).click();
  await expect(panel.getByText("已取消")).toBeVisible();

  const exitSessionName = `exit-${suffix}`;
  await execRemoteSsh(
    remote,
    `tmux new-session -d -s ${shellQuote(exitSessionName)} -n model
tmux send-keys -t ${shellQuote(`${exitSessionName}:0.0`)} ${shellQuote("sleep 300")} Enter
for i in $(seq 1 50); do
  [ "$(tmux display-message -p -t ${shellQuote(`${exitSessionName}:0.0`)} '#{pane_current_command}')" = sleep ] && break
  sleep 0.1
done`,
  );
  await hostNode.getByRole("button", { name: `刷新 ${hostName} 的 Pane` }).click();
  const exitPane = panel.getByTestId(`tmux-pane-${exitSessionName}-0-0`);
  await expect(exitPane).toContainText("sleep");
  await exitPane.getByRole("button", { name: "加入监控" }).click();
  await execRemoteSsh(remote, `tmux kill-session -t ${shellQuote(exitSessionName)}`);
  await hostNode.getByRole("button", { name: /立即检查/ }).click();
  await expect(panel.getByText("Session 已退出")).toBeVisible();
  await expect.poll(() => readTmuxNotifications(bark), { timeout: 30_000 }).toHaveLength(2);

  await execRemoteSsh(remote, "tmux kill-server >/dev/null 2>&1 || true");
});

test("permanently monitors repeated runs and reattaches to the same logical pane", async ({
  page,
}) => {
  const remote = await readRemoteEnv();
  const bark = await useBarkReceiver();
  const suffix = Date.now();
  const sessionName = `permanent-${suffix}`;
  const hostName = `permanent-monitor-host-${suffix}`;

  await execRemoteSsh(
    remote,
    `tmux kill-server >/dev/null 2>&1 || true
tmux new-session -d -s ${shellQuote(sessionName)} -n train`,
  );

  await openApp(page);
  await configureBarkNotifications(page, bark.url);
  const host = await addRemoteHost(page, remote, hostName);
  const project = await addRemoteProject(page, remote, host.id);
  await startRemoteThreadFromProjectMenu(page, project.id);
  await page.getByTestId("open-tmux-button").click();

  const panel = page.getByTestId("tmux-monitor-panel");
  const hostNode = panel.getByTestId(`tmux-host-node-${host.id}`);
  const pane = panel.getByTestId(`tmux-pane-${sessionName}-0-0`);
  await expect(pane.getByRole("button", { name: "已回到 Shell" })).toBeDisabled();
  await pane.getByRole("button", { name: "监控操作" }).click();
  await page.getByRole("menuitem", { name: "永久监控" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("任务每次结束都会发送通知");
  await expect(confirmation).toContainText("直到你手动取消");
  await confirmation.getByRole("button", { name: "启用永久监控" }).click();

  await expect(panel.getByText("永久监控 · 1")).toBeVisible();
  await expect(panel.getByText("永久监控 · 等待中").first()).toBeVisible();
  expect(await readTmuxNotifications(bark)).toHaveLength(0);

  await startTmuxRun(remote, sessionName);
  await hostNode.getByRole("button", { name: /立即检查/ }).click();
  await expect(panel.getByText("永久监控 · 运行中").first()).toBeVisible();
  expect(await readTmuxNotifications(bark)).toHaveLength(0);

  await stopTmuxRun(remote, sessionName);
  await hostNode.getByRole("button", { name: /立即检查/ }).click();
  await expect(panel.getByText("永久监控 · 等待中").first()).toBeVisible();
  await expect.poll(() => readTmuxNotifications(bark), { timeout: 30_000 }).toHaveLength(1);

  await startTmuxRun(remote, sessionName);
  await hostNode.getByRole("button", { name: /立即检查/ }).click();
  await stopTmuxRun(remote, sessionName);
  await hostNode.getByRole("button", { name: /立即检查/ }).click();
  await expect.poll(() => readTmuxNotifications(bark), { timeout: 30_000 }).toHaveLength(2);

  await startTmuxRun(remote, sessionName);
  await hostNode.getByRole("button", { name: /立即检查/ }).click();
  await execRemoteSsh(remote, `tmux kill-session -t ${shellQuote(sessionName)}`);
  await hostNode.getByRole("button", { name: /立即检查/ }).click();
  await expect.poll(() => readTmuxNotifications(bark), { timeout: 30_000 }).toHaveLength(3);
  expect((await readTmuxNotifications(bark))[2]?.body).toContain("状态：Session 已退出");

  await execRemoteSsh(remote, `tmux new-session -d -s ${shellQuote(sessionName)} -n train`);
  await hostNode.getByRole("button", { name: `刷新 ${hostName} 的 Pane` }).click();
  await startTmuxRun(remote, sessionName);
  await hostNode.getByRole("button", { name: /立即检查/ }).click();
  await stopTmuxRun(remote, sessionName);
  await hostNode.getByRole("button", { name: /立即检查/ }).click();
  await expect.poll(() => readTmuxNotifications(bark), { timeout: 30_000 }).toHaveLength(4);

  await panel.getByRole("button", { name: "取消永久监控" }).click();
  await expect(panel.getByText("永久监控 · 0")).toBeVisible();
  await startTmuxRun(remote, sessionName);
  expect(await readTmuxNotifications(bark)).toHaveLength(4);

  await execRemoteSsh(remote, "tmux kill-server >/dev/null 2>&1 || true");
});

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function startTmuxRun(
  remote: Awaited<ReturnType<typeof readRemoteEnv>>,
  sessionName: string,
) {
  await execRemoteSsh(
    remote,
    `tmux send-keys -t ${shellQuote(`${sessionName}:0.0`)} ${shellQuote("sleep 300")} Enter`,
  );
  await expect
    .poll(
      async () =>
        (
          await execRemoteSsh(
            remote,
            `tmux display-message -p -t ${shellQuote(`${sessionName}:0.0`)} '#{pane_current_command}'`,
          )
        ).stdout.trim(),
      { timeout: 10_000 },
    )
    .toBe("sleep");
}

async function stopTmuxRun(remote: Awaited<ReturnType<typeof readRemoteEnv>>, sessionName: string) {
  await execRemoteSsh(remote, `tmux send-keys -t ${shellQuote(`${sessionName}:0.0`)} C-c`);
  await expect
    .poll(
      async () =>
        (
          await execRemoteSsh(
            remote,
            `tmux display-message -p -t ${shellQuote(`${sessionName}:0.0`)} '#{pane_current_command}'`,
          )
        ).stdout.trim(),
      { timeout: 10_000 },
    )
    .toMatch(/bash|zsh|sh/);
}

async function readTmuxNotifications(bark: Awaited<ReturnType<typeof useBarkReceiver>>) {
  return (await bark.readRequests()).filter((request) =>
    request.title.startsWith("Tmux 任务已结束"),
  );
}
