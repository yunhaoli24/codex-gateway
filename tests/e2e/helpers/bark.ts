import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
