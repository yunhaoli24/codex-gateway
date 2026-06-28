import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { Socket } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";
import { SUPPORTED_CODEX_VERSION } from "../../server/utils/gateway/codex-version";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const runtimeDir = join(rootDir, ".e2e-runtime", "ssh-container");
const envFile = join(runtimeDir, "env.json");
const remoteCodexBin = "/home/codex/.nvm/versions/node/v22.0.0/bin/codex";

interface RemoteEnv {
  host: string;
  port: string;
  username: string;
  password: string;
  projectPath: string;
  imagePath: string;
  initialCodexVersion: string;
  supportedCodexVersion: string;
  testModel: string;
  codexBin: string;
  proxyUrl: null;
}

export async function startDockerEnvironment() {
  await mkdir(runtimeDir, { recursive: true });
  const password = process.env.E2E_REMOTE_PASSWORD || "codex";
  const env: RemoteEnv = {
    host: process.env.E2E_REMOTE_HOST || "ssh-target",
    port: process.env.E2E_REMOTE_PORT || "22",
    username: process.env.E2E_REMOTE_USERNAME || "codex",
    password,
    projectPath: process.env.E2E_REMOTE_PROJECT_PATH || "/workspace/codex-gateway",
    imagePath: "/home/codex/e2e-image.png",
    initialCodexVersion: "",
    supportedCodexVersion: SUPPORTED_CODEX_VERSION,
    testModel: process.env.E2E_CODEX_MODEL || "gpt-5.4-mini",
    codexBin: remoteCodexBin,
    proxyUrl: null,
  };

  await waitForSsh(env.host, env.port);
  env.initialCodexVersion = parseCodexVersionOutput(
    (await execRemoteSsh(env, `${remoteCodexBin} --version`)).stdout,
  );
  await prepareRemoteCodexHome(env);
  await writeRemoteImage(env);
  await writeFile(envFile, JSON.stringify(env, null, 2));
  return env;
}

export async function stopDockerEnvironment() {
  await rm(runtimeDir, { recursive: true, force: true });
}

async function waitForSsh(host: string, port: string) {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      await waitForPort(host, Number(port), 2_000);
      const connection = await connectSsh({
        host,
        port,
        username: "codex",
        password: process.env.E2E_REMOTE_PASSWORD || "codex",
      });
      connection.end();
      return;
    } catch (error: any) {
      lastError = error?.message || String(error);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Timed out waiting for SSH target: ${lastError}`);
}

function waitForPort(host: string, port: number, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = new Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to ${host}:${port}`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    });
    socket.connect(port, host);
  });
}

async function prepareRemoteCodexHome(env: RemoteEnv) {
  const sourceCodexHome =
    process.env.E2E_CODEX_HOME || process.env.CODEX_HOME || join(homedir(), ".codex");
  const codexHome = join(runtimeDir, "codex-home");
  await prepareCodexHome(sourceCodexHome, codexHome);

  const connection = await connectSsh(env);
  try {
    await execSsh(connection, "rm -rf /home/codex/.codex && mkdir -p /home/codex/.codex");
    await uploadDirectory(connection, codexHome, "/home/codex/.codex");
    await execSsh(
      connection,
      [
        "mkdir -p /home/codex/.codex/packages/standalone/current",
        `ln -sf ${remoteCodexBin} /home/codex/.codex/packages/standalone/current/codex`,
      ].join(" && "),
    );
  } finally {
    connection.end();
  }
}

async function writeRemoteImage(env: RemoteEnv) {
  const connection = await connectSsh(env);
  try {
    await execSsh(
      connection,
      `printf %s iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg== | base64 -d > ${env.imagePath}`,
    );
  } finally {
    connection.end();
  }
}

async function connectSsh(env: Pick<RemoteEnv, "host" | "port" | "username" | "password">) {
  const client = new Client();
  return await new Promise<Client>((resolve, reject) => {
    client
      .on("ready", () => resolve(client))
      .on("error", reject)
      .connect({
        host: env.host,
        port: Number(env.port),
        username: env.username,
        password: env.password,
        readyTimeout: 10_000,
      });
  });
}

async function execSsh(connection: Client, command: string) {
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      connection.exec(command, (error, channel) => {
        if (error) {
          reject(error);
          return;
        }
        let stdout = "";
        let stderr = "";
        channel.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });
        channel.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        channel.on("error", reject);
        channel.on("close", (code: number | null) => resolve({ code, stdout, stderr }));
      });
    },
  );
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `Remote command failed: ${command}`);
  }
  return result;
}

export async function execRemoteSsh(env: RemoteEnv, command: string) {
  const connection = await connectSsh(env);
  try {
    return await execSsh(connection, command);
  } finally {
    connection.end();
  }
}

function parseCodexVersionOutput(output: string) {
  const match = output.match(/\b\d+\.\d+\.\d+\b/);
  if (!match) {
    throw new Error(`Unable to parse Codex version from: ${output}`);
  }
  return match[0];
}

async function uploadDirectory(
  connection: Client,
  localDirectory: string,
  remoteDirectory: string,
) {
  const sftp = await new Promise<import("ssh2").SFTPWrapper>((resolve, reject) => {
    connection.sftp((error, client) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(client);
    });
  });
  try {
    await mkdirRemote(sftp, remoteDirectory);
    await uploadDirectoryEntries(sftp, localDirectory, remoteDirectory);
  } finally {
    sftp.end();
  }
}

async function uploadDirectoryEntries(
  sftp: import("ssh2").SFTPWrapper,
  localDirectory: string,
  remoteDirectory: string,
) {
  const entries = await readdir(localDirectory);
  for (const entry of entries) {
    const localPath = join(localDirectory, entry);
    const remotePath = `${remoteDirectory}/${basename(entry)}`;
    const stats = await stat(localPath);
    if (stats.isDirectory()) {
      await mkdirRemote(sftp, remotePath);
      await uploadDirectoryEntries(sftp, localPath, remotePath);
    } else if (stats.isFile()) {
      await uploadFile(sftp, localPath, remotePath);
    }
  }
}

async function mkdirRemote(sftp: import("ssh2").SFTPWrapper, path: string) {
  await new Promise<void>((resolve, reject) => {
    sftp.mkdir(path, (error) => {
      if (!error || (error as any).code === 4) {
        resolve();
        return;
      }
      reject(error);
    });
  });
}

async function uploadFile(sftp: import("ssh2").SFTPWrapper, localPath: string, remotePath: string) {
  const data = await readFile(localPath);
  await new Promise<void>((resolve, reject) => {
    sftp.writeFile(remotePath, data, { mode: 0o600 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export { envFile };

async function prepareCodexHome(sourceCodexHome: string, codexHome: string) {
  await rm(codexHome, { recursive: true, force: true });
  await mkdir(codexHome, { recursive: true });
  await Promise.all([
    copyOptional(join(sourceCodexHome, "auth.json"), join(codexHome, "auth.json")),
    copyOptional(join(sourceCodexHome, "config.toml"), join(codexHome, "config.toml")),
    copyOptional(join(sourceCodexHome, "version.json"), join(codexHome, "version.json")),
  ]);
}

async function copyOptional(source: string, target: string) {
  try {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}
