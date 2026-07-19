import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { startDockerEnvironment } from "./docker-environment";
import { E2E_PASSWORD, E2E_USERNAME } from "./helpers/app";

const execFileAsync = promisify(execFile);

export default async function globalSetup() {
  const dbPath = join(process.cwd(), ".data-e2e", "codex-gateway.db");
  process.env.CODEX_GATEWAY_DB_PATH = dbPath;
  process.env.CODEX_GATEWAY_CONFIG_SECRET =
    process.env.CODEX_GATEWAY_CONFIG_SECRET || "e2e-config-secret";
  if (process.env.E2E_DATABASE_PREPARED !== "1") {
    await rm(dirname(dbPath), { recursive: true, force: true });
    await mkdir(dirname(dbPath), { recursive: true });
    await execFileAsync("node", ["scripts/create-user.mjs", E2E_USERNAME, E2E_PASSWORD], {
      env: {
        ...process.env,
        CODEX_GATEWAY_DB_PATH: dbPath,
      },
    });
  }
  await startDockerEnvironment();
}
