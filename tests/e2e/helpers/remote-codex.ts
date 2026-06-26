import { expect, type Browser, type Page } from '@playwright/test'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { envFile } from '../docker-environment'

const execFileAsync = promisify(execFile)

export interface RemoteCodexEnv {
  container?: string
  host: string
  port: string
  username: string
  password: string
  projectPath: string
  imagePath: string
  initialCodexVersion?: string
  latestCodexVersion?: string
  proxyUrl?: string | null
}

export interface UiHost {
  id: number
}

export interface UiProject {
  id: number
}

export async function readRemoteEnv() {
  return JSON.parse(await readFile(envFile, 'utf8')) as RemoteCodexEnv
}

export async function readContainerCodexVersion(remote: RemoteCodexEnv) {
  return await runRemoteCodexVersion(remote)
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
  const verifyResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/hosts/${host.id}/verify`) && response.request().method() === 'POST',
  )
  await page.getByTestId(`verify-host-button-${host.id}`).click()
  const verifyResult = await (await verifyResponsePromise).json() as {
    ok?: boolean
    stdout?: string
    codexVersion?: string
    latestCodexVersion?: string
    upgraded?: boolean
  }
  expect(verifyResult.ok).toBe(true)
  await expect(page.getByText(/codex-cli|app-server RPC OK/)).toBeVisible({ timeout: 60_000 })
  if (remote.initialCodexVersion && remote.latestCodexVersion && remote.initialCodexVersion !== remote.latestCodexVersion) {
    expect(verifyResult.codexVersion).toBe(remote.latestCodexVersion)
    await expect(page.getByText(new RegExp(`codex-cli ${escapeRegExp(remote.latestCodexVersion)}`))).toBeVisible({ timeout: 120_000 })
    const upgradedVersionResponse = await runRemoteCodexVersion(remote)
    expect(upgradedVersionResponse).toContain(remote.latestCodexVersion)
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

export async function startRemoteThread(page: Page) {
  const startThreadResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/threads/start') && response.request().method() === 'POST',
  )
  await page.getByTestId('new-thread-button').click()
  const startThread = await (await startThreadResponsePromise).json()
  const threadId = String(startThread.thread.id)
  await expect(page.getByPlaceholder('输入后续修改要求')).toBeEnabled()
  await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible({ timeout: 30_000 })
  return threadId
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
  return threadId
}

export async function duplicateConfiguredPage(browser: Browser, sourcePage: Page) {
  const configText = await sourcePage.evaluate(() => localStorage.getItem('codex-gateway-config'))
  expect(configText).toBeTruthy()

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')
  await page.evaluate((config) => {
    localStorage.setItem('codex-gateway-config', config)
  }, configText!)
  await page.reload()
  await expect(page.getByTestId('app-ready')).toBeAttached()
  return { context, page }
}

export async function sendTextTurn(page: Page, marker: string) {
  await page.getByPlaceholder('输入后续修改要求').fill(`用一句话回复：${marker}`)
  await page.getByTestId('send-turn-button').click()
}

export async function sendSteerText(page: Page, marker: string) {
  await page.getByPlaceholder('输入后续修改要求').fill(`追加要求：${marker}`)
  await page.getByTestId('send-turn-button').click()
}

export async function sendImageTurnThroughGateway(page: Page, params: {
  hostId: number
  threadId: string
  cwd: string
  imagePath: string
  marker: string
}) {
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/turns/start') && response.request().method() === 'POST',
  )
  await page.evaluate(async ({ hostId, threadId, cwd, imagePath, marker }) => {
    const response = await fetch('/api/turns/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hostId,
        threadId,
        cwd,
        text: `回复：${marker}`,
        images: [{ path: imagePath, detail: 'original' }],
      }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
  }, params)
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
  if (!await page.getByTestId('settings-panel').isVisible().catch(() => false)) {
    return
  }
  await page.getByTestId('settings-close-button').click()
  await expect(page.getByTestId('settings-panel')).toBeHidden()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function runRemoteCodexVersion(remote: RemoteCodexEnv) {
  if (!remote.container) {
    throw new Error('Docker container name is required for remote version assertion')
  }
  const { stdout } = await execFileAsync('docker', [
    'exec',
    '--user',
    remote.username,
    remote.container,
    'sh',
    '-lc',
    'PATH="$HOME/.local/bin:$PATH"; codex --version',
  ], { maxBuffer: 1024 * 1024 })
  return stdout.trim()
}
