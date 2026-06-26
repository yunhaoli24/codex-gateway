import { expect, test } from '@playwright/test'
import {
  addRemoteHost,
  addRemoteProject,
  readRemoteEnv,
  startRemoteThread,
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

  await page.getByTestId(`thread-button-${threadId}`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /置顶/ }).click()
  await expect(page.getByTestId(`pinned-thread-button-${threadId}`)).toBeVisible()

  await page.getByTestId(`pinned-thread-button-${threadId}`).click()
  await expect(page.getByTestId(`project-button-${project.id}`)).toBeHidden()
})
