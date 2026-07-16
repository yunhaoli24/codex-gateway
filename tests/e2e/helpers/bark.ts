import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, type Page } from "@playwright/test";

export interface BarkRequest {
  deviceKey: string;
  title: string;
  body: string;
  group: string | null;
  createdAt: string;
}

export async function useBarkReceiver() {
  const url = process.env.E2E_BARK_SERVER_URL;
  const logPath = process.env.E2E_BARK_REQUEST_LOG;
  if (!url || !logPath) {
    throw new Error("E2E Bark receiver is not configured");
  }
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "");
  return {
    url,
    readRequests: () => readBarkRequests(logPath),
  };
}

export async function configureBarkNotifications(page: Page, serverUrl: string) {
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("tab", { name: "通知" }).click();
  const barkSwitch = page.getByRole("switch", { name: "启用 Bark" });
  if ((await barkSwitch.getAttribute("aria-checked")) !== "true") await barkSwitch.click();
  await page.getByLabel("Bark 服务地址").fill(serverUrl);
  await page.getByLabel("Bark 设备 Key").fill("e2e-device-key");
  await page.getByLabel("Bark 分组").fill("E2E Group");
  await page.getByRole("button", { name: "保存通知设置" }).click();
  await expect(page.getByText("通知设置已保存")).toBeVisible();
}

async function readBarkRequests(logPath: string) {
  const text = await readFile(logPath, "utf8").catch((error: any) => {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BarkRequest);
}
