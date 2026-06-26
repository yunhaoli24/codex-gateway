import { expect, test } from '@playwright/test'
import {
  addRemoteHost,
  addRemoteProject,
  readRemoteEnv,
  sendTextTurn,
  startRemoteThread,
  startRemoteThreadFromProjectMenu,
} from './helpers/remote-codex'

test('connects to a real SSH Codex host and lists a project thread created by app-server', async ({ page }) => {
  const remote = await readRemoteEnv()

  await page.goto('/')
  await expect(page.getByTestId('app-ready')).toBeAttached()
  await expect(page.getByPlaceholder('输入后续修改要求')).toBeHidden()

  const host = await addRemoteHost(page, remote)
  const project = await addRemoteProject(page, remote, host.id)

  await expect(page.getByTestId('project-thread-list')).toBeVisible()
  await expect(page.getByTestId('project-thread-list').getByRole('heading', { name: project.name })).toBeVisible()

  const threadId = await startRemoteThread(page)
  await expect(page.getByTestId(`thread-button-${threadId}`)).toBeVisible()
  const secondThreadId = await startRemoteThreadFromProjectMenu(page, project.id)
  await expect(page.getByTestId(`thread-button-${secondThreadId}`)).toBeVisible()

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

  await page.reload()
  await expect(page.getByTestId('app-ready')).toBeAttached()
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toBeVisible()
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeHidden()
  await expect.poll(async () => page.getByTestId('chat-scroll-area').evaluate((root) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    if (!viewport) return false
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
  })).toBe(true)
})
