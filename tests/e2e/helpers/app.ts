import { expect, type Page } from '@playwright/test'

export async function openApp(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitForHydratedApp(page)
}

export async function reloadApp(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForHydratedApp(page)
}

async function waitForHydratedApp(page: Page) {
  const diagnostics = collectPageDiagnostics(page)
  await expect(page.getByTestId('app-ready'), await diagnostics()).toBeAttached({ timeout: 90_000 })
  await expect(page.getByTestId('desktop-layout').or(page.getByTestId('mobile-layout')), await diagnostics()).toBeVisible({ timeout: 30_000 })
}

function collectPageDiagnostics(page: Page) {
  const lines: string[] = []
  page.on('console', (message) => {
    lines.push(`console ${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    lines.push(`pageerror: ${error.message}`)
  })
  page.on('requestfailed', (request) => {
    lines.push(`requestfailed ${request.method()} ${request.url()}: ${request.failure()?.errorText || 'unknown'}`)
  })
  return async () => {
    const url = page.url()
    const title = await page.title().catch((error: Error) => `title error: ${error.message}`)
    const body = await page.locator('body').innerText({ timeout: 1_000 }).catch((error: Error) => `body error: ${error.message}`)
    return [
      `url: ${url}`,
      `title: ${title}`,
      `body: ${body.slice(0, 2000)}`,
      ...lines.slice(-30),
    ].join('\n')
  }
}
