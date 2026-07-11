import { expect, type Page } from "@playwright/test";

export const E2E_USERNAME = process.env.E2E_GATEWAY_USERNAME || "e2e";
export const E2E_PASSWORD = process.env.E2E_GATEWAY_PASSWORD || "codex-gateway-e2e-password";
const resetPages = new WeakSet<Page>();

export async function openApp(page: Page, options: { resetConfig?: boolean } = {}) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForHydratedApp(page, options);
}

export async function reloadApp(page: Page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForHydratedApp(page);
}

export async function authenticatedFetch<T>(
  page: Page,
  request: {
    url: string;
    method?: string;
    body?: unknown;
  },
) {
  return await page.evaluate(async (request) => {
    const token = localStorage.getItem("codex-gateway-auth-token");
    if (!token) {
      throw new Error("Missing E2E auth token");
    }
    const response = await fetch(request.url, {
      method: request.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(request.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }, request);
}

async function waitForHydratedApp(page: Page, options: { resetConfig?: boolean } = {}) {
  const diagnostics = collectPageDiagnostics(page);
  await expect(page.getByTestId("app-ready"), await diagnostics()).toBeAttached({
    timeout: 90_000,
  });
  await loginIfNeeded(page);
  if (options.resetConfig !== false && !resetPages.has(page)) {
    resetPages.add(page);
    await resetGatewayConfig(page);
    await page.evaluate(() => {
      localStorage.removeItem("codex-gateway-navigation");
      window.history.replaceState(window.history.state, "", window.location.pathname);
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHydratedApp(page, { resetConfig: false });
    return;
  }
  await expect(
    page.getByTestId("desktop-layout").or(page.getByTestId("mobile-layout")),
    await diagnostics(),
  ).toBeVisible({ timeout: 30_000 });
}

export async function resetGatewayConfig(page: Page) {
  await authenticatedFetch(page, {
    url: "/api/config/sync",
    method: "POST",
    body: {
      version: 1,
      hosts: [],
      projects: [],
      pinnedThreads: [],
    },
  });
}

async function loginIfNeeded(page: Page) {
  if (
    !(await page
      .getByTestId("login-form")
      .isVisible()
      .catch(() => false))
  ) {
    return;
  }
  await page.getByTestId("login-username").fill(E2E_USERNAME);
  await page.getByTestId("login-password").fill(E2E_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-form")).toBeHidden({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean(localStorage.getItem("codex-gateway-auth-token")), {
    timeout: 30_000,
  });
}

function collectPageDiagnostics(page: Page) {
  const lines: string[] = [];
  page.on("console", (message) => {
    lines.push(`console ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    lines.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    lines.push(
      `requestfailed ${request.method()} ${request.url()}: ${request.failure()?.errorText || "unknown"}`,
    );
  });
  return async () => {
    const url = page.url();
    const title = await page.title().catch((error: Error) => `title error: ${error.message}`);
    const body = await page
      .locator("body")
      .innerText({ timeout: 1_000 })
      .catch((error: Error) => `body error: ${error.message}`);
    return [
      `url: ${url}`,
      `title: ${title}`,
      `body: ${body.slice(0, 2000)}`,
      ...lines.slice(-30),
    ].join("\n");
  };
}
