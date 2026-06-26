import { expect, test } from '@playwright/test'
import {
  addRemoteHost,
  addRemoteProject,
  duplicateConfiguredPage,
  readRemoteEnv,
  sendImageTurnThroughGateway,
  sendTextTurn,
  startRemoteThread,
} from './helpers/remote-codex'

test.describe.configure({ mode: 'serial' })

test('fans out a real remote app-server thread to multiple browser clients across turns', async ({ browser, page }) => {
  const remote = await readRemoteEnv()

  await page.goto('/')
  await expect(page.getByTestId('app-ready')).toBeAttached()

  const host = await addRemoteHost(page, remote)
  const project = await addRemoteProject(page, remote, host.id)
  await expect(page.getByTestId('project-thread-list')).toBeVisible()
  const threadId = await startRemoteThread(page)

  const firstMarker = `E2E 第一轮 ${Date.now()}`
  await sendTextTurn(page, firstMarker)
  await expect(page.getByTestId('chat-scroll-area').getByText(firstMarker)).toBeVisible({ timeout: 120_000 })

  const second = await duplicateConfiguredPage(browser, page)
  try {
    await expect(second.page.getByTestId(`project-button-${project.id}`)).toBeVisible()
    await second.page.getByTestId(`project-button-${project.id}`).click()
    await expect(second.page.getByTestId(`project-thread-row-${threadId}`)).toBeVisible({ timeout: 30_000 })
    await second.page.getByTestId(`project-thread-row-${threadId}`).click()
    await expect(second.page.getByPlaceholder('输入后续修改要求')).toBeEnabled()
    await expect(second.page.getByTestId('chat-scroll-area').getByText(firstMarker)).toBeVisible({ timeout: 120_000 })
    await expect.poll(async () => second.page.getByTestId('chat-scroll-area').evaluate((root) => {
      const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
      if (!viewport) return false
      return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
    })).toBe(true)

    const secondMarker = `E2E 第二轮图片 ${Date.now()}`
    await sendImageTurnThroughGateway(second.page, {
      hostId: host.id,
      threadId,
      cwd: remote.projectPath,
      imagePath: remote.imagePath,
      marker: secondMarker,
    })
    await expect(page.getByTestId('chat-scroll-area').getByText(secondMarker)).toBeVisible({ timeout: 120_000 })
  } finally {
    await second.context.close()
  }
})
