import { expect, test } from '@playwright/test'
import { parseCodexVersion } from '../../server/utils/gateway/codex-version'
import {
  addRemoteHost,
  addRemoteProject,
  execRemoteSsh,
  readContainerCodexVersion,
  readRemoteEnv,
  resetRemoteAppServer,
  remoteCodexCommand,
  sendTextTurn,
  startRemoteThreadFromProjectMenu,
} from './helpers/remote-codex'

test('parses current Codex CLI and app-server user-agent versions', () => {
  expect(parseCodexVersion('codex-cli 0.142.2')?.version).toBe('0.142.2')
  expect(parseCodexVersion('Codex Desktop/0.142.0 (Debian 13.0.0; x86_64) unknown (codex_gateway_probe; 0.1.0)')?.version).toBe('0.142.0')
})

test('upgrades an old remote npm Codex install before using the app-server', async ({ page }) => {
  const remote = await readRemoteEnv()
  test.skip(
    !remote.initialCodexVersion || !remote.supportedCodexVersion || remote.initialCodexVersion === remote.supportedCodexVersion,
    'The E2E image is already using the supported Codex version.',
  )

  await expect.poll(async () => readContainerCodexVersion(remote), {
    timeout: 30_000,
  }).toContain(remote.initialCodexVersion!)

  await page.goto('/')
  await expect(page.getByTestId('app-ready')).toBeAttached()

  const host = await addRemoteHost(page, remote, `old-codex-upgrade-${Date.now()}`)
  await expect.poll(async () => readContainerCodexVersion(remote), {
    timeout: 30_000,
  }).toContain(remote.supportedCodexVersion!)

  const project = await addRemoteProject(page, remote, host.id, `upgrade-project-${Date.now()}`)
  const threadId = await startRemoteThreadFromProjectMenu(page, project.id)
  const marker = `E2E 升级后发送 ${Date.now()}`
  await sendTextTurn(page, marker, { hostId: host.id, threadId, cwd: remote.projectPath })
  await expect(page.getByTestId('chat-scroll-area').getByText(marker)).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel('已完成')).toBeVisible({ timeout: 120_000 })
})

test('replaces an unmanaged remote app-server when no loaded turn is active', async ({ page }) => {
  const remote = await readRemoteEnv()
  const codexBin = remoteCodexCommand(remote)

  await resetRemoteAppServer(remote)
  await execRemoteSsh(remote, `
set -eu
socket="\${CODEX_HOME:-$HOME/.codex}/app-server-control/app-server-control.sock"
daemon_dir="\${CODEX_HOME:-$HOME/.codex}/app-server-daemon"
rm -f "$daemon_dir"/app-server.pid "$daemon_dir"/app-server.pid.lock "$daemon_dir"/app-server.stderr.log
nohup ${codexBin} app-server --listen unix:// >/tmp/codex-gateway-unmanaged-app-server.log 2>&1 </dev/null &
for i in $(seq 1 100); do
  if [ -S "$socket" ]; then
    break
  fi
  sleep 0.1
done
if [ ! -S "$socket" ]; then
  echo "socket was not created: $socket"
  ps -eo pid=,args= | grep 'codex app-server' || true
  cat /tmp/codex-gateway-unmanaged-app-server.log || true
  exit 1
fi
rm -f "$daemon_dir"/app-server.pid "$daemon_dir"/app-server.pid.lock "$daemon_dir"/app-server.stderr.log
daemon_output="$(${codexBin} app-server daemon version 2>&1 || true)"
echo "$daemon_output"
echo "$daemon_output" | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  const parsed = JSON.parse(input);
  if (parsed.backend === "pid") process.exit(1);
});
'
`)

  await page.goto('/')
  await expect(page.getByTestId('app-ready')).toBeAttached()

  const host = await addRemoteHost(page, remote, `unmanaged-codex-${Date.now()}`)
  const project = await addRemoteProject(page, remote, host.id, `unmanaged-project-${Date.now()}`)
  const threadId = await startRemoteThreadFromProjectMenu(page, project.id)
  const marker = `E2E 非 daemon 重启 ${Date.now()}`
  await sendTextTurn(page, marker, { hostId: host.id, threadId, cwd: remote.projectPath })
  await expect(page.getByTestId('chat-scroll-area').getByText(marker)).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel('已完成')).toBeVisible({ timeout: 120_000 })
})
