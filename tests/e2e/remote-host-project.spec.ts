import { expect, test } from '@playwright/test'
import { openApp, reloadApp } from './helpers/app'
import {
  addRemoteHost,
  addRemoteProject,
  readRemoteEnv,
  sendTextTurn,
  startRemoteThreadFromProjectMenu,
} from './helpers/remote-codex'

test('connects to a real SSH Codex host and lists a project thread created by app-server', async ({ page }) => {
  const remote = await readRemoteEnv()
  const realtimeSockets: string[] = []
  page.on('websocket', (webSocket) => {
    if (webSocket.url().endsWith('/api/realtime')) {
      realtimeSockets.push(webSocket.url())
    }
  })

  await openApp(page)
  await expect(page.getByPlaceholder('输入后续修改要求')).toBeHidden()
  await expect.poll(() => realtimeSockets.length, { timeout: 10_000 }).toBe(1)

  const host = await addRemoteHost(page, remote)
  const project = await addRemoteProject(page, remote, host.id)

  await expect(page.getByTestId('project-thread-list')).toBeVisible()
  await expect(page.getByTestId('project-thread-list').getByRole('heading', { name: project.name })).toBeVisible()

  const threadId = await startRemoteThreadFromProjectMenu(page, project.id)
  await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible()
  const secondThreadId = await startRemoteThreadFromProjectMenu(page, project.id)
  await expect(page.getByTestId(`thread-button-${secondThreadId}`)).toBeVisible()

  const firstDraft = `E2E 草稿一 ${Date.now()}`
  const secondDraft = `E2E 草稿二 ${Date.now()}`
  await page.getByTestId(`thread-button-${threadId}`).click()
  await page.getByPlaceholder('输入后续修改要求').fill(firstDraft)
  await page.getByTestId(`thread-button-${secondThreadId}`).click()
  await expect(page.getByPlaceholder('输入后续修改要求')).toHaveValue('')
  await page.getByPlaceholder('输入后续修改要求').fill(secondDraft)
  await page.getByTestId(`thread-button-${threadId}`).click()
  await expect(page.getByPlaceholder('输入后续修改要求')).toHaveValue(firstDraft)
  await page.getByTestId(`thread-button-${secondThreadId}`).click()
  await expect(page.getByPlaceholder('输入后续修改要求')).toHaveValue(secondDraft)
  await page.getByPlaceholder('输入后续修改要求').fill('')

  let openRequests = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/threads/open') && request.method() === 'POST') {
      openRequests += 1
    }
  })
  await page.getByTestId(`thread-button-${threadId}`).click()
  await page.getByTestId(`thread-button-${secondThreadId}`).click()
  await page.getByTestId(`thread-button-${threadId}`).click()
  await page.waitForTimeout(500)
  expect(openRequests).toBe(0)
  expect(realtimeSockets).toHaveLength(1)

  const marker = `E2E 置顶恢复 ${Date.now()}`
  await sendTextTurn(page, marker)
  await expect(page.getByTestId('chat-scroll-area').getByText(marker)).toBeVisible({ timeout: 120_000 })

  await page.getByTestId(`thread-button-${threadId}`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /置顶/ }).click()
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toBeVisible()

  await page.getByTestId(`pinned-thread-button-${threadId}`).click()
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeHidden()
  await expect.poll(async () => page.getByTestId('chat-scroll-area').evaluate((root) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    if (!viewport) return false
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
  })).toBe(true)

  await reloadApp(page)
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toBeVisible()
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeHidden()
  await expect.poll(async () => page.getByTestId('chat-scroll-area').evaluate((root) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    if (!viewport) return false
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
  })).toBe(true)
})
