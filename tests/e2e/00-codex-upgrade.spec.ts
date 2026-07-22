import { expect, test } from "@playwright/test";
import type { HostRecord } from "../../shared/types";
import { parseCodexVersion } from "../../server/utils/gateway/infra/codex-version";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import {
  addRemoteHost,
  addRemoteProject,
  execRemoteSsh,
  readContainerCodexVersion,
  readRemoteEnv,
  readUpgradeRemoteEnvs,
  resetRemoteAppServer,
  remoteCodexCommand,
  sendTextTurn,
  startRemoteThreadFromProjectMenu,
  stopRemoteFixture,
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

test("upgrades empty, legacy Node, and legacy Codex SSH hosts serially", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const environments = await readUpgradeRemoteEnvs();
  const remote = environments.find(({ runtimeFixture }) => runtimeFixture === "empty-runtime")!;

  for (const environment of environments) {
    await verifyInitialRuntime(environment);
  }

  await openApp(page);
  const hosts: HostRecord[] = [];
  for (const environment of environments) {
    hosts.push(
      await authenticatedFetch<HostRecord>(page, {
        url: "/api/hosts",
        method: "POST",
        body: {
          name: `upgrade-${environment.runtimeFixture}-${Date.now()}`,
          sshHost: environment.host,
          username: environment.username,
          port: Number(environment.port),
          authMode: "password",
          password: environment.password,
          proxyUrl: environment.proxyUrl ?? null,
        },
      }),
    );
  }

  for (const environment of environments) {
    await expect
      .poll(async () => readContainerCodexVersion(environment).catch(() => "runtime not ready"), {
        timeout: 240_000,
      })
      .toContain(environment.supportedCodexVersion!);
    // Seeing the binary version only proves npm has replaced the package. Wait for the
    // install shell's cleanup trap instead of coupling this backend test to sidebar state.
    await verifyOfficialNpmLayout(environment);
  }

  for (const [index, environment] of environments.entries()) {
    if (environment === remote) continue;
    await authenticatedFetch(page, {
      url: `/api/hosts/${hosts[index]!.id}`,
      method: "DELETE",
    });
    await stopRemoteFixture(environment);
  }

  const host = hosts[environments.indexOf(remote)]!;
  // Hosts were registered directly through the API so all upgrades could queue immediately.
  // Refresh once before the sole product-flow test to hydrate Pinia with the surviving Host.
  await reloadApp(page);
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

async function verifyInitialRuntime(remote: Awaited<ReturnType<typeof readRemoteEnv>>) {
  const checks = {
    "empty-runtime":
      "! command -v node && ! command -v npm && ! command -v codex && printf 'empty runtime verified\\n'",
    "legacy-node": `
test "$(node --version)" = "v${remote.initialNodeVersion}"
command -v npm >/dev/null
! command -v codex
printf 'legacy Node runtime verified\\n'
`,
    "legacy-codex": `
node_bin=${JSON.stringify(remote.codexBin?.replace(/\/codex$/, "/node"))}
test "$("$node_bin" --version)" = "v${remote.initialNodeVersion}"
${remoteCodexCommand(remote)} --version | grep -F ${JSON.stringify(remote.initialCodexVersion)}
printf 'legacy Codex runtime verified\\n'
`,
  } as const;
  const result = await execRemoteSsh(remote, `set -eu\n${checks[remote.runtimeFixture!]}`);
  expect(result.stdout).toContain("verified");
}

async function verifyOfficialNpmLayout(remote: Awaited<ReturnType<typeof readRemoteEnv>>) {
  await expect
    .poll(
      async () => {
        try {
          const { stdout } = await execRemoteSsh(
            remote,
            `
set -eu
codex_bin=${JSON.stringify(remote.codexBin)}
codex_bin_dir="$(dirname "$codex_bin")"
PATH="$codex_bin_dir:$PATH"
export PATH
npm_root="$(npm root -g)"
fail() { printf 'npm layout check failed: %s\n' "$1" >&2; exit 1; }
test -f "$npm_root/@openai/codex/package.json" || fail "missing @openai/codex under $npm_root"
test "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 16 || fail "Node is older than 16"
test "$(command -v node)" = "$(dirname "$codex_bin")/node" || fail "Codex and Node do not share the official npm prefix"
node -e 'require.resolve("@openai/codex-linux-x64/package.json", { paths: [process.argv[1]] })' "$npm_root/@openai/codex" || fail "missing official platform package"
if [ -d "$HOME/.cache/codex-gateway/upgrades" ]; then
  test -z "$(find "$HOME/.cache/codex-gateway/upgrades" -mindepth 1 -maxdepth 1 -type d -name 'upgrade.*' -print -quit)" || fail "remote staging directory was not cleaned"
fi
printf 'official npm layout and staging cleanup verified\\n'
`,
          );
          return stdout.trim();
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
      { timeout: 120_000 },
    )
    .toContain("official npm layout and staging cleanup verified");
}

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
