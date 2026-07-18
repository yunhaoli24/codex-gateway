import { expect, test } from "@playwright/test";
import { parseCodexVersion } from "../../server/utils/gateway/infra/codex-version";
import { openApp } from "./helpers/app";
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
} from "./helpers/remote-codex";

test("parses current Codex CLI and app-server user-agent versions", () => {
  expect(parseCodexVersion("codex-cli 0.142.2")?.version).toBe("0.142.2");
  expect(
    parseCodexVersion("Codex Desktop/0.142.0 (Debian 13.0.0; x86_64) unknown (codex-tui; 0.143.0)")
      ?.version,
  ).toBe("0.142.0");
  expect(
    parseCodexVersion("codex-tui/0.142.4 (Ubuntu 24.4.0; x86_64) unknown (codex-tui; 0.143.0)")
      ?.version,
  ).toBe("0.142.4");
  expect(parseCodexVersion("codex_cli_rs/9.8.7-test (Test OS; x86_64) rust")?.version).toBe(
    "9.8.7-test",
  );
});

test("upgrades an old remote npm Codex install before using the app-server", async ({ page }) => {
  const remote = await readRemoteEnv();
  test.skip(
    !remote.initialCodexVersion ||
      !remote.supportedCodexVersion ||
      remote.initialCodexVersion === remote.supportedCodexVersion,
    "The E2E image is already using the supported Codex version.",
  );

  await expect
    .poll(async () => readContainerCodexVersion(remote), {
      timeout: 30_000,
    })
    .toContain(remote.initialCodexVersion!);

  await openApp(page);

  const host = await addRemoteHost(page, remote, `old-codex-upgrade-${Date.now()}`);
  await expect
    .poll(async () => readContainerCodexVersion(remote), {
      timeout: 30_000,
    })
    .toContain(remote.supportedCodexVersion!);

  const npmLayout = await execRemoteSsh(
    remote,
    `
set -eu
codex_bin=${JSON.stringify(remote.codexBin)}
codex_bin_dir="$(dirname "$codex_bin")"
PATH="$codex_bin_dir:$PATH"
export PATH
npm_root="$(npm root -g)"
test -f "$npm_root/@openai/codex/package.json"
node -e 'require.resolve("@openai/codex-linux-x64/package.json", { paths: [process.argv[1]] })' "$npm_root/@openai/codex"
if [ -d "$HOME/.cache/codex-gateway/upgrades" ]; then
  test -z "$(find "$HOME/.cache/codex-gateway/upgrades" -mindepth 1 -maxdepth 1 -type d -name 'upgrade.*' -print -quit)"
fi
printf 'official npm layout and staging cleanup verified\\n'
`,
  );
  expect(npmLayout.stdout).toContain("official npm layout and staging cleanup verified");

  const project = await addRemoteProject(page, remote, host.id, `upgrade-project-${Date.now()}`);
  const threadId = await startRemoteThreadFromProjectMenu(page, project.id);
  const marker = `E2E 升级后发送 ${Date.now()}`;
  await sendTextTurn(page, marker, { hostId: host.id, threadId, cwd: remote.projectPath });
  await expect(page.getByTestId("chat-scroll-area").getByText(marker)).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("已完成")).toBeVisible({
    timeout: 120_000,
  });
});

test("replaces an existing socket app-server when no loaded turn is active", async ({ page }) => {
  const remote = await readRemoteEnv();
  const codexBin = remoteCodexCommand(remote);

  await resetRemoteAppServer(remote);
  await execRemoteSsh(
    remote,
    `
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
`,
  );

  await openApp(page);

  const host = await addRemoteHost(page, remote, `unmanaged-codex-${Date.now()}`);
  const project = await addRemoteProject(page, remote, host.id, `unmanaged-project-${Date.now()}`);
  const threadId = await startRemoteThreadFromProjectMenu(page, project.id);
  const marker = `E2E socket app-server 重启 ${Date.now()}`;
  await sendTextTurn(page, marker, { hostId: host.id, threadId, cwd: remote.projectPath });
  await expect(page.getByTestId("chat-scroll-area").getByText(marker)).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("已完成")).toBeVisible({
    timeout: 120_000,
  });
});
