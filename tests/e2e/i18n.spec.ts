import { expect, test } from '@playwright/test'

test('defaults to Chinese and can switch to English', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-ready')).toBeAttached()
  await expect(page.getByText('新聊天')).toBeVisible()
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'English' }).click()
  await expect(page.getByText('New chat')).toBeVisible()
})
