import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Client } from "ssh2";
import { envFile } from "../docker-environment";

export interface RemoteCodexEnv {
  host: string;
  port: string;
  username: string;
  password: string;
  projectPath: string;
  imagePath: string;
  initialCodexVersion?: string;
  supportedCodexVersion?: string;
  testModel?: string;
  codexBin?: string;
  proxyUrl?: string | null;
}

export interface UiHost {
  id: number;
}

export interface UiProject {
  id: number;
  hostId: number;
  name: string;
  remotePath: string;
}

export async function readRemoteEnv() {
  return JSON.parse(await readFile(envFile, "utf8")) as RemoteCodexEnv;
}

export async function readContainerCodexVersion(remote: RemoteCodexEnv) {
  return await runRemoteCodexVersion(remote);
}

export async function execRemoteSsh(remote: RemoteCodexEnv, command: string) {
  const connection = await connectRemoteSsh(remote);
  try {
    return await execSsh(connection, command);
  } finally {
    connection.end();
  }
}

export async function resetRemoteAppServer(remote: RemoteCodexEnv) {
  await execRemoteSsh(
    remote,
    `
set -eu
socket="\${CODEX_HOME:-$HOME/.codex}/app-server-control/app-server-control.sock"
daemon_dir="\${CODEX_HOME:-$HOME/.codex}/app-server-daemon"
pids="$(ps -eo pid=,args= | awk -v self="$$" '
  $1 != self && index($0, "codex app-server") && !index($0, "awk") { print $1 }
')"
if [ -n "$pids" ]; then
  kill -TERM $pids >/dev/null 2>&1 || true
fi
for i in $(seq 1 100); do
  if ! ps -eo pid=,args= | awk -v self="$$" '
    $1 != self && index($0, "codex app-server") && !index($0, "awk") { found = 1 }
    END { exit found ? 0 : 1 }
  '; then
    break
  fi
  sleep 0.1
done
pids="$(ps -eo pid=,args= | awk -v self="$$" '
  $1 != self && index($0, "codex app-server") && !index($0, "awk") { print $1 }
')"
if [ -n "$pids" ]; then
  kill -KILL $pids >/dev/null 2>&1 || true
fi
rm -f "$socket"
rm -f "$daemon_dir"/app-server.pid "$daemon_dir"/app-server.pid.lock "$daemon_dir"/app-server.stderr.log
`,
  );
}

export async function addRemoteHost(
  page: Page,
  remote: RemoteCodexEnv,
  name = `docker-codex-${Date.now()}`,
) {
  await openSettingsTab(page, "主机");
  const hostForm = page
    .getByTestId("add-host-button")
    .locator("xpath=ancestor::div[.//*[@data-testid='host-name-input']][1]");
  await hostForm.getByTestId("host-name-input").fill(name);
  await hostForm.getByTestId("host-ssh-input").fill(remote.host);
  await hostForm.getByPlaceholder("用户").fill(remote.username);
  await hostForm.getByPlaceholder("端口").fill(remote.port);
  if (remote.proxyUrl !== undefined) {
    await hostForm.getByTestId("host-proxy-url-input").fill(remote.proxyUrl ?? "");
  }
  await hostForm.getByTestId("host-auth-select").click();
  await page.getByTestId("host-auth-password-option").click();
  await hostForm.getByPlaceholder("SSH 密码").fill(remote.password);

  const hostResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/hosts") && response.request().method() === "POST",
  );
  await hostForm.getByTestId("add-host-button").click();
  const host = (await (await hostResponsePromise).json()) as UiHost;
  await closeSettings(page);
  await expect(hostConnectedIndicator(page, host.id)).toBeVisible({ timeout: 120_000 });
  if (
    remote.initialCodexVersion &&
    remote.supportedCodexVersion &&
    remote.initialCodexVersion !== remote.supportedCodexVersion
  ) {
    const upgradedVersionResponse = await runRemoteCodexVersion(remote);
    expect(upgradedVersionResponse).toContain(remote.supportedCodexVersion);
  }
  return host;
}

function hostConnectedIndicator(page: Page, hostId: number) {
  return page.getByTestId(`host-button-${hostId}`).getByLabel(/已连接|Connected/);
}

export async function addRemoteProject(
  page: Page,
  remote: RemoteCodexEnv,
  hostId: number,
  name = `remote-project-${Date.now()}`,
) {
  await page.getByTestId(`host-button-${hostId}`).click({ button: "right" });
  await page.getByRole("menuitem", { name: /添加项目|Add project/ }).click();
  await page.getByTestId("project-name-input").fill(name);
  await page.getByTestId("project-path-input").fill(remote.projectPath);

  const projectResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/projects") && response.request().method() === "POST",
  );
  await page.getByTestId("add-project-button").click();
  const project = (await (await projectResponsePromise).json()) as UiProject;
  await expect(page.getByTestId(`host-button-${hostId}`)).toBeVisible();
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeVisible();
  return project;
}

export async function startRemoteThreadFromProjectMenu(page: Page, projectId: number) {
  const remote = await readRemoteEnv();
  await page.getByTestId(`project-button-${projectId}`).click({ button: "right" });
  await page.getByRole("menuitem", { name: /新建/ }).click();
  const threadId = await waitForSelectedThreadId(page);
  await expect(page.getByPlaceholder("输入后续修改要求")).toBeEnabled();
  await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible({ timeout: 30_000 });
  if (remote.testModel) {
    await page.evaluate(async (model) => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      const composer = pinia?._s?.get("gateway-composer");
      if (!composer) {
        throw new Error("Unable to locate gateway composer Pinia store");
      }
      await composer.saveSelectedThreadSettings({ model });
    }, remote.testModel);
  }
  return threadId;
}

export async function waitForSelectedThreadId(page: Page) {
  const handle = await page.waitForFunction(
    () => new URLSearchParams(window.location.search).get("threadId"),
    undefined,
    { timeout: 30_000 },
  );
  const threadId = await handle.jsonValue();
  return String(threadId);
}

export async function sendTextTurn(
  page: Page,
  marker: string,
  context?: { hostId: number; threadId: string; cwd?: string },
) {
  if (context) {
    await expect
      .poll(async () => (await currentRouteSelection(page)).threadId, { timeout: 10_000 })
      .toBe(context.threadId);
  }
  await page.getByPlaceholder("输入后续修改要求").fill(`用一句话回复：${marker}`);
  await page.getByTestId("send-turn-button").click();
}

export async function sendSteerText(page: Page, marker: string) {
  await page.getByPlaceholder("输入后续修改要求").fill(`追加要求：${marker}`);
  await page.getByTestId("send-turn-button").click();
}

export async function sendImageTurnThroughGateway(
  page: Page,
  params: {
    hostId: number;
    threadId: string;
    cwd: string;
    imagePath: string;
    marker: string;
  },
) {
  const remote = await readRemoteEnv();
  await expect
    .poll(async () => (await currentRouteSelection(page)).threadId, { timeout: 10_000 })
    .toBe(params.threadId);
  await page.evaluate(
    async ({ marker, imagePath, model }) => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway-thread-turns");
      if (!store) {
        throw new Error("Unable to locate gateway thread-turns Pinia store");
      }
      await store.sendTurn(`回复：${marker}`, {
        model: model || undefined,
        images: [{ path: imagePath, detail: "original" }],
      });
    },
    {
      marker: params.marker,
      imagePath: params.imagePath,
      model: remote.testModel || null,
    },
  );
}

async function openSettings(page: Page) {
  if (
    await page
      .getByTestId("settings-panel")
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }
  await page.getByTestId("settings-toggle").click();
  await expect(page.getByTestId("settings-panel")).toBeVisible();
}

async function openSettingsTab(page: Page, tabName: string) {
  await openSettings(page);
  await page.getByRole("tab", { name: tabName }).click();
}

async function closeSettings(page: Page) {
  const panel = page.getByTestId("settings-panel");
  await expect(panel)
    .toBeHidden({ timeout: 1_000 })
    .catch(() => null);
  if (!(await panel.isVisible().catch(() => false))) {
    return;
  }
  await page.getByTestId("settings-close-button").last().click();
  await expect(panel).toBeHidden();
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function runRemoteCodexVersion(remote: RemoteCodexEnv) {
  const { stdout } = await execRemoteSsh(remote, `${remoteCodexCommand(remote)} --version`);
  return stdout.trim();
}

export function remoteCodexCommand(remote: RemoteCodexEnv) {
  const candidates = [
    remote.codexBin,
    "$HOME/.npm-global/bin/codex",
    "$HOME/.local/bin/codex",
  ].filter(Boolean) as string[];
  const candidateList = candidates.map(shellQuote).join(" ");
  return `$(
for candidate in ${candidateList}; do
  if [ -x "$candidate" ]; then
    printf '%s\\n' "$candidate"
    exit 0
  fi
done
command -v codex 2>/dev/null || printf '%s\\n' codex
)`;
}

async function currentRouteSelection(page: Page) {
  return page.evaluate(() => {
    const params = new URLSearchParams(window.location.search);
    const hostId = Number(params.get("hostId"));
    const projectId = Number(params.get("projectId"));
    return {
      hostId: Number.isInteger(hostId) && hostId > 0 ? hostId : null,
      projectId: Number.isInteger(projectId) && projectId > 0 ? projectId : null,
      threadId: params.get("threadId") || null,
    };
  });
}

async function connectRemoteSsh(remote: RemoteCodexEnv) {
  const client = new Client();
  return await new Promise<Client>((resolve, reject) => {
    client
      .on("ready", () => resolve(client))
      .on("error", reject)
      .connect({
        host: remote.host,
        port: Number(remote.port),
        username: remote.username,
        password: remote.password,
        readyTimeout: 10_000,
      });
  });
}

async function execSsh(connection: Client, command: string) {
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      connection.exec(command, (error, channel) => {
        if (error) {
          reject(error);
          return;
        }
        let stdout = "";
        let stderr = "";
        channel.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });
        channel.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        channel.on("error", reject);
        channel.on("close", (code: number | null) => {
          if (code !== 0) {
            reject(
              new Error(
                [stdout ? `stdout:\n${stdout}` : null, stderr ? `stderr:\n${stderr}` : null]
                  .filter(Boolean)
                  .join("\n") || `Remote command failed: ${command}`,
              ),
            );
            return;
          }
          resolve({ code, stdout, stderr });
        });
      });
    },
  );
}
