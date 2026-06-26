import { expect, test } from '@playwright/test'
import {
  addRemoteHost,
  addRemoteProject,
  readContainerCodexVersion,
  readRemoteEnv,
  sendTextTurn,
  startRemoteThreadFromProjectMenu,
} from './helpers/remote-codex'

test('upgrades an old remote npm Codex install before using the app-server', async ({ page }) => {
  const remote = await readRemoteEnv()
  test.skip(
    !remote.initialCodexVersion || !remote.latestCodexVersion || remote.initialCodexVersion === remote.latestCodexVersion,
    'The E2E image is already using the npm latest Codex version.',
  )

  await expect.poll(async () => readContainerCodexVersion(remote), {
    timeout: 30_000,
  }).toContain(remote.initialCodexVersion!)

  await page.goto('/')
  await expect(page.getByTestId('app-ready')).toBeAttached()

  const host = await addRemoteHost(page, remote, `old-codex-upgrade-${Date.now()}`)
  await expect.poll(async () => readContainerCodexVersion(remote), {
    timeout: 30_000,
  }).toContain(remote.latestCodexVersion!)

  const project = await addRemoteProject(page, remote, host.id, `upgrade-project-${Date.now()}`)
  const threadId = await startRemoteThreadFromProjectMenu(page, project.id)
  const marker = `E2E 升级后发送 ${Date.now()}`
  await sendTextTurn(page, marker)
  await expect(page.getByTestId('chat-scroll-area').getByText(marker)).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId(`thread-button-${threadId}`).getByLabel('已完成')).toBeVisible({ timeout: 120_000 })
})
