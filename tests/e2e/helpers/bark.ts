import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { expect, type Page } from "@playwright/test";
import { z } from "zod";
import { nodeErrorCode } from "./node-errors";

export interface BarkRequest {
  deviceKey: string;
  title: string;
  body: string;
  group: string | null;
  id: string | null;
  createdAt: string;
}

const barkRequestSchema = z.object({
  deviceKey: z.string(),
  title: z.string(),
  body: z.string(),
  group: z.string().nullable(),
  id: z.string().nullable(),
  createdAt: z.string(),
});

export async function useBarkReceiver() {
  const url = process.env.E2E_BARK_SERVER_URL;
  const logPath = process.env.E2E_BARK_REQUEST_LOG;
  if (url === undefined || url === "" || logPath === undefined || logPath === "") {
    throw new Error("E2E Bark receiver is not configured");
  }
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "");
  const deviceKey = `e2e-device-${randomUUID()}`;
  return {
    url,
    deviceKey,
    // The receiver log is shared by the worker. Filtering by a per-test device key
    // prevents a delayed HTTP delivery from a previous browser flow from changing
    // the current test's notification count.
    readRequests: async () =>
      (await readBarkRequests(logPath)).filter((request) => request.deviceKey === deviceKey),
  };
}

export async function configureBarkNotifications(page: Page, serverUrl: string, deviceKey: string) {
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("tab", { name: "通知" }).click();
  const barkSwitch = page.getByRole("switch", { name: "启用 Bark" });
  if ((await barkSwitch.getAttribute("aria-checked")) !== "true") await barkSwitch.click();
  await page.getByLabel("Bark 服务地址").fill(serverUrl);
  await page.getByLabel("Bark 设备 Key").fill(deviceKey);
  await page.getByLabel("Bark 分组").fill("E2E Group");
  await page.getByRole("button", { name: "保存通知设置" }).click();
  await expect(page.getByText("通知设置已保存")).toBeVisible();
}

async function readBarkRequests(logPath: string) {
  const text = await readFile(logPath, "utf8").catch((error: unknown) => {
    if (nodeErrorCode(error) === "ENOENT") {
      return "";
    }
    throw error;
  });
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => barkRequestSchema.parse(JSON.parse(line)));
}
