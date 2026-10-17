import { expect, test } from "./fixtures/remote-workspace";
import type { Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { parseCodexVersion } from "../../server/utils/gateway/infra/codex/codex-version";
import { authenticatedFetch, E2E_PASSWORD, openApp, reloadApp } from "./helpers/app";
import { hostRecordSchema } from "./helpers/http-schemas";
import {
  addRemoteProject,
  addRemoteHost,
  execRemoteSsh,
  readContainerCodexVersion,
  readUpgradeRemoteEnvs,
  type RemoteCodexEnv,
  type UiHost,
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

test("upgrades SSH runtimes and shows shared-target progress across browser pages", async ({
  page,
  browser,
}) => {
  test.setTimeout(10 * 60_000);
  const environments = await readUpgradeRemoteEnvs();
  const remote = environments.find(({ runtimeFixture }) => runtimeFixture === "empty-runtime")!;

  for (const environment of environments) {
    await verifyInitialRuntime(environment);
    if (environment === remote) {
      // A user reconnecting after a dropped upload must reuse that partial. A hard link outside
      // staging proves the browser-driven upgrade extended the original file, rather than
      // abandoning it in a new random directory. The final checksum verifies the resumed bytes.
      await execRemoteSsh(
        environment,
        `set -eu
archive=/opt/codex-upgrade-package.tar.gz
digest="$(sha256sum "$archive" | awk '{print $1}')"
stage="$HOME/.cache/codex-gateway/upgrades/upgrade.$digest"
mkdir -p "$stage"
head -c 1048576 "$archive" > "$stage/codex-package-x86_64-unknown-linux-musl.tar.gz.part"
ln "$stage/codex-package-x86_64-unknown-linux-musl.tar.gz.part" "$HOME/upgrade-resume-proof"
`,
      );
    }
    if (environment.runtimeFixture === "npm-codex") {
      // A real previous managed daemon runs independently of the npm CLI. Connecting from the
      // browser must upgrade that daemon too, not merely report the new standalone CLI version.
      await execRemoteSsh(
        environment,
        `set -eu
cd "$HOME"
/opt/codex-previous-daemon/bin/codex app-server daemon start >/dev/null
/opt/codex-previous-daemon/bin/codex app-server daemon update --from-cli --yes >/dev/null
`,
      );
      // A previous interrupted migration can leave `current` as a real directory. This is a
      // legacy upgrade state, not a mocked transport; keep it in the real SSH fixture so the
      // standalone switch is verified against the failure seen in production.
      await execRemoteSsh(
        environment,
        `mkdir -p "$HOME/.codex/packages/standalone/current" && printf stale > "$HOME/.codex/packages/standalone/current/stale-marker"`,
      );
    }
  }

  await openApp(page, { interceptRealtime: false });
  // Account setup uses the normal registration script; both viewers then authenticate and add
  // their hosts through the real UI. Each account keeps its own host names and credentials.
  const username = `upgrade-observer-${Date.now()}`;
  await promisify(execFile)("node", ["scripts/create-user.mjs", username, E2E_PASSWORD]);
  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const otherPage = await otherContext.newPage();
  await otherPage.goto("/", { waitUntil: "domcontentloaded" });
  await otherPage.getByTestId("login-username").fill(username);
  await otherPage.getByTestId("login-password").fill(E2E_PASSWORD);
  await otherPage.getByTestId("login-submit").click();
  await expect(otherPage.getByTestId("login-form")).toBeHidden();
  await openApp(otherPage, { resetConfig: false, interceptRealtime: false });

  const host = await addRemoteHost(page, remote, `upgrade-owner-${Date.now()}`, {
    waitForConnection: false,
  });
  await expectHostUpgradeProgress(page, host.id);
  const alias = await addRemoteHost(otherPage, remote, `upgrade-observer-${Date.now()}`, {
    waitForConnection: false,
  });
  await expectHostUpgradeProgress(otherPage, alias.id);
  const hosts: UiHost[] = [];
  for (const environment of environments) {
    if (environment === remote) {
      hosts.push(host);
      continue;
    }
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
    if (environment === remote) {
      const proof = await execRemoteSsh(
        environment,
        `set -eu
expected="$(sha256sum /opt/codex-upgrade-package.tar.gz | awk '{print $1}')"
actual="$(sha256sum "$HOME/upgrade-resume-proof" | awk '{print $1}')"
test "$actual" = "$expected"
rm "$HOME/upgrade-resume-proof"
printf 'interrupted upload resumed and verified\\n'
`,
      );
      expect(proof.stdout).toContain("interrupted upload resumed and verified");
    }
  }

  for (const targetPage of [page, otherPage]) {
    await expect(targetPage.getByTestId("host-upgrade-progress")).toHaveCount(0, {
      timeout: 120_000,
    });
  }
  await authenticatedFetch(
    otherPage,
    { url: `/api/hosts/${alias.id}`, method: "DELETE" },
    () => undefined,
  );
  await otherContext.close();

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

  // Refresh before starting the product flow with the surviving host.
  await reloadApp(page);
  const project = await addRemoteProject(page, remote, host.id, `upgrade-project-${Date.now()}`);
  const threadId = await startRemoteThreadFromProjectMenu(page, remote, project.remotePath);
  const marker = `E2E 升级后发送 ${Date.now()}`;
  await sendTextTurn(page, marker, { hostId: host.id, threadId, cwd: remote.projectPath });
  await expect(page.getByTestId("chat-scroll-area").getByText(marker)).toBeVisible({
    timeout: 240_000,
  });
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel("已完成")).toBeVisible({
    timeout: 240_000,
  });
});

async function expectHostUpgradeProgress(page: Page, hostId: number) {
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("tab", { name: "主机", exact: true }).click();
  const row = page.getByTestId(`host-management-status-${hostId}`);
  await expect(row.getByTestId("host-upgrade-progress")).toBeVisible();
  await expect(page.getByTestId(`host-daemon-restart-${hostId}`)).toBeDisabled();
}

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
daemon_root="$codex_home/packages/app-server-daemon/current"
test -f "$daemon_root/codex-package.json" || fail "dedicated daemon package is missing"
"$codex_bin" app-server daemon version
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
          const [daemonJson, ...verification] = stdout.trim().split("\n");
          z.object({
            appServerVersion: z.literal(remote.supportedCodexVersion!),
            managedCodexVersion: z.literal(remote.supportedCodexVersion!),
          }).parse(JSON.parse(daemonJson ?? ""));
          return verification.join("\n");
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
rm -f "$daemon_dir"/app-server.pid "$daemon_dir"/app-server.pid.lock "$daemon_dir"/app-server.stderr.log
rm -f "$daemon_dir"/daemon.pid "$daemon_dir"/daemon.pid.lock "$daemon_dir"/daemon.stderr.log
rm -f "$daemon_dir"/daemon-updater.pid "$daemon_dir"/daemon-updater.pid.lock "$daemon_dir"/daemon-updater.stderr.log
rm -f "$daemon_dir"/loaded-threads.json
mkdir -p "$daemon_dir"
# This is the same synchronous official daemon lifecycle command used by Gateway. The browser
# still drives the scenario; the shell only provisions the real remote app-server process.
${codexBin} app-server daemon start >"$daemon_dir/e2e-app-server.log" 2>&1
if [ ! -S "$socket" ]; then
  echo "socket was not created: $socket"
  ps -eo pid=,args= | grep 'codex app-server' || true
  cat "$daemon_dir/e2e-app-server.log" || true
  exit 1
fi
rm -f "$daemon_dir"/app-server.pid "$daemon_dir"/app-server.pid.lock "$daemon_dir"/app-server.stderr.log "$daemon_dir"/loaded-threads.json
`,
  );

  const threadId = await remoteWorkspace.startThread(project.remotePath);
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
