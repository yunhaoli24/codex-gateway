import { expect, test } from '@playwright/test'
import {
  addRemoteHost,
  addRemoteProject,
  duplicateConfiguredPage,
  readRemoteEnv,
  sendImageTurnThroughGateway,
  sendTextTurn,
  startRemoteThreadFromProjectMenu,
} from './helpers/remote-codex'

test.describe.configure({ mode: 'serial' })

test('fans out a real remote app-server thread to multiple browser clients across turns', async ({ browser, page }) => {
  const remote = await readRemoteEnv()

  await page.goto('/')
  await expect(page.getByTestId('app-ready')).toBeAttached()

  const host = await addRemoteHost(page, remote)
  const project = await addRemoteProject(page, remote, host.id)
  await expect(page.getByTestId('project-thread-list')).toBeVisible()
  const threadId = await startRemoteThreadFromProjectMenu(page, project.id)

  const firstMarker = `E2E 第一轮 ${Date.now()}`
  await sendTextTurn(page, firstMarker)
  await expect(page.getByTestId('send-turn-button')).toHaveAttribute('aria-label', '运行中')
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel('运行中')).toBeVisible()
  await expect(page.getByTestId(`thread-button-${threadId}`).locator('.animate-spin')).toBeVisible()
  await expect(page.getByTestId('chat-scroll-area').getByText(firstMarker)).toBeVisible({ timeout: 120_000 })
  const processToggle = page.getByRole('button', { name: /中间过程/ })
  if (await processToggle.isVisible().catch(() => false)) {
    await processToggle.click()
    await expect(processToggle).toHaveAttribute('data-state', 'open')
  }
  await expect(page.getByTestId('send-turn-button')).toHaveAttribute('aria-label', '已完成', { timeout: 120_000 })
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel('已完成')).toBeVisible()

  const second = await duplicateConfiguredPage(browser, page)
  try {
    await expect(second.page.getByTestId(`project-button-${project.id}`)).toBeVisible()
    await second.page.getByTestId(`project-button-${project.id}`).click()
    await expect(second.page.getByTestId(`project-thread-row-${threadId}`)).toBeVisible({ timeout: 30_000 })
    const openResponsePromise = second.page.waitForResponse((response) =>
      response.url().endsWith('/api/threads/open') && response.request().method() === 'POST',
    ).catch(() => null)
    await second.page.getByTestId(`project-thread-row-${threadId}`).click()
    const openResponse = await openResponsePromise
    if (openResponse) {
      expect(openResponse.ok(), await openResponse.text()).toBe(true)
    }
    await expect(second.page.getByPlaceholder('输入后续修改要求')).toBeEnabled()
    await expect.poll(async () => second.page.getByTestId('chat-scroll-area').getByText(firstMarker).count(), {
      timeout: 120_000,
    }).toBeGreaterThan(0)
    await second.page.getByTestId('chat-scroll-area').evaluate((root) => {
      const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    })
    await expect.poll(async () => second.page.getByTestId('chat-scroll-area').evaluate((root) => {
      const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
      if (!viewport) return false
      return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
    }), { timeout: 5_000 }).toBe(true)

    const secondMarker = `E2E 第二轮图片 ${Date.now()}`
    await sendImageTurnThroughGateway(second.page, {
      hostId: host.id,
      threadId,
      cwd: remote.projectPath,
      imagePath: remote.imagePath,
      marker: secondMarker,
    })
    await expect(page.getByTestId('chat-scroll-area').getByText(`回复：${secondMarker}`)).toBeVisible({ timeout: 120_000 })
  } finally {
    await second.context.close()
  }
})
