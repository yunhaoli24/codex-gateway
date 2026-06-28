import { expect, type Browser, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { Client } from 'ssh2'
import { envFile } from '../docker-environment'
import { openApp, reloadApp } from './app'

export interface RemoteCodexEnv {
  host: string
  port: string
  username: string
  password: string
  projectPath: string
  imagePath: string
  initialCodexVersion?: string
  supportedCodexVersion?: string
  testModel?: string
  codexBin?: string
  proxyUrl?: string | null
}

export interface UiHost {
  id: number
}

export interface UiProject {
  id: number
  hostId: number
  remotePath: string
}

export async function readRemoteEnv() {
  return JSON.parse(await readFile(envFile, 'utf8')) as RemoteCodexEnv
}

export async function readContainerCodexVersion(remote: RemoteCodexEnv) {
  return await runRemoteCodexVersion(remote)
}

export async function execRemoteSsh(remote: RemoteCodexEnv, command: string) {
  const connection = await connectRemoteSsh(remote)
  try {
    return await execSsh(connection, command)
  } finally {
    connection.end()
  }
}

export async function resetRemoteAppServer(remote: RemoteCodexEnv) {
  const codexBin = remoteCodexCommand(remote)
  await execRemoteSsh(remote, `
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
`)
}


export async function addRemoteHost(page: Page, remote: RemoteCodexEnv, name = `docker-codex-${Date.now()}`) {
  await openSettingsTab(page, '主机')
  await page.getByTestId('host-name-input').fill(name)
  await page.getByTestId('host-ssh-input').fill(remote.host)
  await page.getByPlaceholder('用户').fill(remote.username)
  await page.getByPlaceholder('端口').fill(remote.port)
  if (remote.proxyUrl !== undefined) {
    await page.getByTestId('host-proxy-url-input').fill(remote.proxyUrl ?? '')
  }
  await page.getByTestId('host-auth-select').click()
  await page.getByTestId('host-auth-password-option').click()
  await page.getByPlaceholder('SSH 密码').fill(remote.password)

  const hostResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/hosts') && response.request().method() === 'POST',
  )
  await page.getByTestId('add-host-button').click()
  const host = await (await hostResponsePromise).json() as UiHost
  await closeSettings(page)
  const verifyResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/hosts/${host.id}/verify`) && response.request().method() === 'POST',
  )
  await page.getByTestId(`verify-host-button-${host.id}`).click()
  const verifyResponse = await verifyResponsePromise
  const verifyResult = await verifyResponse.json() as {
    ok?: boolean
    stdout?: string
    statusMessage?: string
    message?: string
    codexVersion?: string
    supportedCodexVersion?: string
    upgraded?: boolean
  }
  expect(verifyResult.ok, `verify host failed: HTTP ${verifyResponse.status()} ${JSON.stringify(verifyResult)}`).toBe(true)
  await expect(page.getByText(/codex-cli|app-server RPC OK/)).toBeVisible({ timeout: 60_000 })
  if (remote.initialCodexVersion && remote.supportedCodexVersion && remote.initialCodexVersion !== remote.supportedCodexVersion) {
    expect(verifyResult.codexVersion).toBe(remote.supportedCodexVersion)
    await expect(page.getByText(new RegExp(`codex-cli ${escapeRegExp(remote.supportedCodexVersion)}`))).toBeVisible({ timeout: 120_000 })
    const upgradedVersionResponse = await runRemoteCodexVersion(remote)
    expect(upgradedVersionResponse).toContain(remote.supportedCodexVersion)
  }
  return host
}

export async function addRemoteProject(page: Page, remote: RemoteCodexEnv, hostId: number, name = `remote-project-${Date.now()}`) {
  await openSettingsTab(page, '项目')
  await page.getByTestId('project-name-input').fill(name)
  await page.getByTestId('project-path-input').fill(remote.projectPath)

  const projectResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/projects') && response.request().method() === 'POST',
  )
  await page.getByTestId('add-project-button').click()
  const project = await (await projectResponsePromise).json() as UiProject
  await closeSettings(page)
  await expect(page.getByTestId(`host-button-${hostId}`)).toBeVisible()
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeVisible()
  return project
}

export async function startRemoteThreadFromProjectMenu(page: Page, projectId: number) {
  const startThreadResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/threads/start') && response.request().method() === 'POST',
  )
  await page.getByTestId(`project-button-${projectId}`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /新建/ }).click()
  const startThread = await (await startThreadResponsePromise).json()
  const threadId = String(startThread.thread.id)
  await expect(page.getByPlaceholder('输入后续修改要求')).toBeEnabled()
  await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible({ timeout: 30_000 })
  await expect.poll(async () => (await currentRouteSelection(page)).threadId, { timeout: 10_000 }).toBe(threadId)
  return threadId
}

export async function duplicateConfiguredPage(browser: Browser, sourcePage: Page) {
  const configText = await sourcePage.evaluate(() => localStorage.getItem('codex-gateway-config'))
  expect(configText).toBeTruthy()

  const context = await browser.newContext()
  const page = await context.newPage()
  await openApp(page)
  await page.evaluate((config) => {
    localStorage.setItem('codex-gateway-config', config)
  }, configText!)
  await reloadApp(page)
  return { context, page }
}

export async function sendTextTurn(page: Page, marker: string, context?: { hostId: number, threadId: string, cwd?: string }) {
  if (context) {
    await expect.poll(async () => (await currentRouteSelection(page)).threadId, { timeout: 10_000 }).toBe(context.threadId)
  }
  await page.getByPlaceholder('输入后续修改要求').fill(`用一句话回复：${marker}`)
  await page.getByTestId('send-turn-button').click()
}

export async function sendSteerText(page: Page, marker: string) {
  await page.getByPlaceholder('输入后续修改要求').fill(`追加要求：${marker}`)
  await page.getByTestId('send-turn-button').click()
}

export async function sendTextTurnThroughGateway(page: Page, text: string, context?: { hostId: number, threadId: string, cwd?: string }) {
  const remote = await readRemoteEnv()
  const selection = await currentRouteSelection(page)
  const hostId = context?.hostId ?? selection.hostId
  const threadId = context?.threadId ?? selection.threadId
  expect(hostId).toBeGreaterThan(0)
  expect(threadId).toBeTruthy()
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/turns/start') && response.request().method() === 'POST',
  )
  await page.evaluate(async ({ hostId, threadId, cwd, text, model }) => {
    const response = await fetch('/api/turns/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hostId,
        threadId,
        cwd,
        text,
        model: model || undefined,
      }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
  }, {
    hostId: hostId!,
    threadId: threadId!,
    cwd: context?.cwd ?? remote.projectPath,
    text,
    model: remote.testModel ?? null,
  })
  await responsePromise
}

export async function sendImageTurnThroughGateway(page: Page, params: {
  hostId: number
  threadId: string
  cwd: string
  imagePath: string
  marker: string
}) {
  const remote = await readRemoteEnv()
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/turns/start') && response.request().method() === 'POST',
  )
  await page.evaluate(async ({ hostId, threadId, cwd, imagePath, marker, model }) => {
    const response = await fetch('/api/turns/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hostId,
        threadId,
        cwd,
        text: `回复：${marker}`,
        model: model || undefined,
        images: [{ path: imagePath, detail: 'original' }],
      }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
  }, { ...params, model: remote.testModel ?? null })
  await responsePromise
}

async function openSettings(page: Page) {
  if (await page.getByTestId('settings-panel').isVisible().catch(() => false)) {
    return
  }
  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
}

async function openSettingsTab(page: Page, tabName: string) {
  await openSettings(page)
  await page.getByRole('tab', { name: tabName }).click()
}

async function closeSettings(page: Page) {
  const panel = page.getByTestId('settings-panel')
  await expect(panel).toBeHidden({ timeout: 1_000 }).catch(() => null)
  if (!await panel.isVisible().catch(() => false)) {
    return
  }
  await page.getByTestId('settings-close-button').last().click()
  await expect(panel).toBeHidden()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

async function runRemoteCodexVersion(remote: RemoteCodexEnv) {
  const { stdout } = await execRemoteSsh(remote, `${remoteCodexCommand(remote)} --version`)
  return stdout.trim()
}

export function remoteCodexCommand(remote: RemoteCodexEnv) {
  return shellQuote(remote.codexBin || 'codex')
}

async function currentRouteSelection(page: Page) {
  return page.evaluate(() => {
    const params = new URLSearchParams(window.location.search)
    const hostId = Number(params.get('hostId'))
    const projectId = Number(params.get('projectId'))
    return {
      hostId: Number.isInteger(hostId) && hostId > 0 ? hostId : null,
      projectId: Number.isInteger(projectId) && projectId > 0 ? projectId : null,
      threadId: params.get('threadId') || null,
    }
  })
}

async function connectRemoteSsh(remote: RemoteCodexEnv) {
  const client = new Client()
  return await new Promise<Client>((resolve, reject) => {
    client
      .on('ready', () => resolve(client))
      .on('error', reject)
      .connect({
        host: remote.host,
        port: Number(remote.port),
        username: remote.username,
        password: remote.password,
        readyTimeout: 10_000,
      })
  })
}

async function execSsh(connection: Client, command: string) {
  return await new Promise<{ code: number | null, stdout: string, stderr: string }>((resolve, reject) => {
    connection.exec(command, (error, channel) => {
      if (error) {
        reject(error)
        return
      }
      let stdout = ''
      let stderr = ''
      channel.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      channel.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      channel.on('error', reject)
      channel.on('close', (code: number | null) => {
        if (code !== 0) {
          reject(new Error([
            stdout ? `stdout:\n${stdout}` : null,
            stderr ? `stderr:\n${stderr}` : null,
          ].filter(Boolean).join('\n') || `Remote command failed: ${command}`))
          return
        }
        resolve({ code, stdout, stderr })
      })
    })
  })
}
