import { expect, test } from '@playwright/test'
import { startCodexAppServer } from './codex-app-server'

test.describe.configure({ mode: 'serial' })

test('connects gateway to a local Codex app-server and lists/starts a thread', async ({ page }, testInfo) => {
  const port = 47000 + testInfo.workerIndex
  const codex = await startCodexAppServer(port)
  test.info().annotations.push({ type: 'codex-app-server', description: codex.url })

  try {
    await page.goto('/')
    await expect(page.getByTestId('app-ready')).toBeAttached()
    await expect(page.getByText('新聊天')).toBeVisible()
    await expect(page.getByPlaceholder('输入后续修改要求')).toBeVisible()

    await page.getByTestId('settings-toggle').click()
    await page.getByTestId('host-name-input').fill('local-codex')
    await page.getByTestId('host-ssh-input').fill('127.0.0.1')
    await page.getByLabel('App server').click()
    await page.getByRole('option', { name: 'WebSocket' }).click()
    await page.getByTestId('app-server-url-input').fill(codex.url)
    const hostResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/hosts') && response.request().method() === 'POST',
    )
    await page.getByTestId('add-host-button').click()
    const hostResponse = await hostResponsePromise
    const host = await hostResponse.json()

    await page.getByTestId(`verify-host-button-${host.id}`).click()
    await expect(page.getByText(`Connected to ${codex.url}`)).toBeVisible()

    await page.getByTestId('project-name-input').fill('codex-gateway')
    await page.getByTestId('project-path-input').fill(process.cwd())
    await page.getByTestId('add-project-button').click()
    await expect(page.getByTestId('project-thread-list')).toBeVisible()

    await page.getByTestId('refresh-threads-button').click()
    await page.getByTestId('new-thread-button').click()
    await expect(page.getByPlaceholder('输入后续修改要求')).toBeEnabled()
    await expect(page.getByText('打开或创建一个会话')).toBeVisible()

    if (process.env.E2E_CODEX_TURN === '1') {
      await page.getByPlaceholder('输入后续修改要求').fill('用一句话回复：E2E OK')
      await page.getByTestId('send-turn-button').click()
      await expect(page.getByText(/turn|命令|读取|思考/)).toBeVisible({ timeout: 60_000 })
    }
  } finally {
    await codex.stop()
  }
})

test('defaults to Chinese and can switch to English', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-ready')).toBeAttached()
  await expect(page.getByText('新聊天')).toBeVisible()
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'English' }).click()
  await expect(page.getByText('New chat')).toBeVisible()
})
