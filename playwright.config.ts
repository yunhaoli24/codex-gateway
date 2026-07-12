import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "rm -rf .data-e2e .output .nuxt && pnpm build && HOST=0.0.0.0 PORT=3100 node .output/server/index.mjs",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      CODEX_GATEWAY_CONFIG_SECRET: process.env.CODEX_GATEWAY_CONFIG_SECRET || "e2e-config-secret",
      CODEX_GATEWAY_DB_PATH: process.env.CODEX_GATEWAY_DB_PATH || ".data-e2e/codex-gateway.db",
      NUXT_IGNORE_LOCK: "1",
      BROWSER_PREVIEW_PUBLIC_PORT: "3100",
      BROWSER_PREVIEW_DOMAIN: "127.0.0.1.nip.io",
      BROWSER_PREVIEW_SCHEME: "http",
    },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /.*\.mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      testMatch: /.*\.mobile\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
  ],
});
