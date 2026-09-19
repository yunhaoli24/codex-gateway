import { expect, test } from "./fixtures/remote-workspace";
import type { HostRecord } from "../../shared/types";
import { parseCodexVersion } from "../../server/utils/gateway/infra/codex/codex-version";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { hostRecordSchema } from "./helpers/http-schemas";
import {
  addRemoteProject,
  execRemoteSsh,
  readContainerCodexVersion,
  readUpgradeRemoteEnvs,
  type RemoteCodexEnv,
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

test("upgrades empty, legacy Node, and npm Codex SSH hosts with bounded concurrency", async ({
  page,
}) => {
  test.setTimeout(10 * 60_000);
  const environments = await readUpgradeRemoteEnvs();
  const remote = environments.find(({ runtimeFixture }) => runtimeFixture === "empty-runtime")!;

  for (const environment of environments) {
    await verifyInitialRuntime(environment);
    if (environment.runtimeFixture === "npm-codex") {
      // A previous interrupted migration can leave `current` as a real directory. This is a
      // legacy upgrade state, not a mocked transport; keep it in the real SSH fixture so the
      // standalone switch is verified against the failure seen in production.
      await execRemoteSsh(
        environment,
        `mkdir -p "$HOME/.codex/packages/standalone/current" && printf stale > "$HOME/.codex/packages/standalone/current/stale-marker"`,
      );
    }
  }

  await openApp(page);
  const hosts: HostRecord[] = [];
  for (const environment of environments) {
    hosts.push(
      await authenticatedFetch(
        page,
        {
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
        },
        (value) => hostRecordSchema.parse(value),
      ),
    );
  }

  for (const environment of environments) {
    await expect
      .poll(async () => readContainerCodexVersion(environment).catch(() => "runtime not ready"), {
        timeout: 240_000,
      })
      .toContain(environment.supportedCodexVersion!);
    // Seeing the binary version only proves the package was replaced. Wait for the workflow's
    // final cleanup and verify the official standalone layout instead of coupling this test to
    // sidebar state.
    await verifyOfficialStandaloneLayout(environment);
  }

  for (const [index, environment] of environments.entries()) {
    if (environment === remote) continue;
    await authenticatedFetch(
      page,
      {
        url: `/api/hosts/${hosts[index]!.id}`,
        method: "DELETE",
      },
      () => undefined,
    );
    await stopRemoteFixture(environment);
  }

  const host = hosts[environments.indexOf(remote)]!;
  // Hosts were registered directly through the API so all upgrades could queue immediately.
  // Refresh once before the sole product-flow test to hydrate Pinia with the surviving Host.
  await reloadApp(page);
  const project = await addRemoteProject(page, remote, host.id, `upgrade-project-${Date.now()}`);
  const threadId = await startRemoteThreadFromProjectMenu(page, remote, project.id);
  const marker = `E2E 升级后发送 ${Date.now()}`;
  await sendTextTurn(page, marker, { hostId: host.id, threadId, cwd: remote.projectPath });
  await expect(page.getByTestId("chat-scroll-area").getByText(marker)).toBeVisible({
    timeout: 240_000,
  });
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("已完成")).toBeVisible({
    timeout: 240_000,
  });
});

async function verifyInitialRuntime(remote: RemoteCodexEnv) {
  const checks = {
    "empty-runtime":
      "! command -v node && ! command -v npm && ! command -v codex && printf 'empty runtime verified\\n'",
    "legacy-node": `
test "$(node --version)" = "v${remote.initialNodeVersion}"
command -v npm >/dev/null
! command -v codex
printf 'legacy Node runtime verified\\n'
`,
    "npm-codex": `
node_bin=${JSON.stringify(remote.initialCodexBin?.replace(/\/codex$/, "/node"))}
test "$("$node_bin" --version)" = "v${remote.initialNodeVersion}"
${remoteCodexCommand(remote, remote.initialCodexBin)} --version | grep -F ${JSON.stringify(remote.initialCodexVersion)}
printf 'npm-installed Codex runtime verified\\n'
`,
    "current-codex": `
${remoteCodexCommand(remote)} --version | grep -F ${JSON.stringify(remote.supportedCodexVersion)}
printf 'current Codex runtime verified\\n'
`,
  } as const;
  const result = await execRemoteSsh(remote, `set -eu\n${checks[remote.runtimeFixture!]}`);
  expect(result.stdout).toContain("verified");
}

async function verifyOfficialStandaloneLayout(remote: RemoteCodexEnv) {
  await expect
    .poll(
      async () => {
        try {
          const { stdout } = await execRemoteSsh(
            remote,
            `
set -eu
codex_bin=${JSON.stringify(remote.codexBin)}
codex_home="\${CODEX_HOME:-$HOME/.codex}"
standalone_root="$codex_home/packages/standalone"
current_link="$standalone_root/current"
fail() { printf 'standalone layout check failed: %s\n' "$1" >&2; exit 1; }
test -L "$codex_bin" || fail "visible Codex entrypoint is not a symlink"
test "$(readlink "$codex_bin")" = "$current_link/bin/codex" || fail "visible entrypoint does not target current"
test -L "$current_link" || fail "standalone current link is missing"
release_dir="$(cd -P "$current_link" 2>/dev/null && pwd)" || fail "standalone current link is broken"
test -f "$release_dir/codex-package.json" || fail "standalone package manifest is missing"
test -x "$release_dir/bin/codex" || fail "standalone Codex binary is missing"
test -x "$release_dir/bin/codex-code-mode-host" || fail "standalone code-mode host is missing"
test -x "$release_dir/codex-path/rg" || fail "standalone ripgrep is missing"
minimal_path="$HOME/.local/bin:/usr/bin:/bin"
resolved_minimal="$(PATH="$minimal_path" command -v codex)"
test "$resolved_minimal" = "$codex_bin" || fail "standalone Codex is not selected without npm or nvm paths"
minimal_version="$(HOME="$HOME" CODEX_HOME="$codex_home" PATH="$minimal_path" codex --version)"
printf '%s\n' "$minimal_version" | grep -F ${JSON.stringify(remote.supportedCodexVersion)} >/dev/null || fail "standalone Codex cannot run without Node"
if [ -d "$HOME/.cache/codex-gateway/upgrades" ]; then
  test -z "$(find "$HOME/.cache/codex-gateway/upgrades" -mindepth 1 -maxdepth 1 -type d -name 'upgrade.*' -print -quit)" || fail "remote staging directory was not cleaned"
fi
printf 'official standalone layout and staging cleanup verified\\n'
`,
          );
          return stdout.trim();
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
      { timeout: 120_000 },
    )
    .toContain("official standalone layout and staging cleanup verified");
}

test("starts the official managed daemon for an existing socket app-server", async ({
  page,
  remoteWorkspace,
}) => {
  const { remote } = remoteWorkspace;

  await openApp(page);
  const { host, project } = await remoteWorkspace.provision({
    hostName: `managed-daemon-codex-${Date.now()}`,
    projectName: `managed-daemon-project-${Date.now()}`,
  });

  // Establish a managed installation first. This test can run independently instead of relying
  // on the upgrade matrix test to install Codex into the shared remote fixture.
  const codexBin = remoteCodexCommand(remote);
  await resetRemoteAppServer(remote);
  await execRemoteSsh(
    remote,
    `
set -eu
socket="\${CODEX_HOME:-$HOME/.codex}/app-server-control/app-server-control.sock"
daemon_dir="\${CODEX_HOME:-$HOME/.codex}/app-server-daemon"
rm -f "$daemon_dir"/app-server.pid "$daemon_dir"/app-server.pid.lock "$daemon_dir"/app-server.stderr.log "$daemon_dir"/loaded-threads.json
mkdir -p "$daemon_dir"
# This is the same official daemon lifecycle command used by Gateway. The browser still drives
# the scenario; the shell only provisions the real remote app-server process.
nohup ${codexBin} app-server daemon bootstrap --remote-control >"$daemon_dir/e2e-app-server.log" 2>&1 </dev/null &
for i in $(seq 1 100); do
  if [ -S "$socket" ]; then
    break
  fi
  sleep 0.1
done
if [ ! -S "$socket" ]; then
  echo "socket was not created: $socket"
  ps -eo pid=,args= | grep 'codex app-server' || true
  cat "$daemon_dir/e2e-app-server.log" || true
  exit 1
fi
rm -f "$daemon_dir"/app-server.pid "$daemon_dir"/app-server.pid.lock "$daemon_dir"/app-server.stderr.log "$daemon_dir"/loaded-threads.json
`,
  );

  const threadId = await remoteWorkspace.startThread(project.id);
  const marker = `E2E socket app-server 重启 ${Date.now()}`;
  await sendTextTurn(page, marker, { hostId: host.id, threadId, cwd: remote.projectPath });
  await expect(page.getByTestId("chat-scroll-area").getByText(marker)).toBeVisible({
    timeout: 120_000,
  });
  // The response marker proves the browser reached the daemon-backed app-server. The composer
  // is the user-facing completion state for the selected turn; the sidebar row can lag while
  // its activity projection catches up and is not part of this daemon transport assertion.
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成", {
    timeout: 120_000,
  });
});
