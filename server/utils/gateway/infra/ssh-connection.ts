import { createReadStream, readFileSync } from "node:fs";
import { stat as statLocal } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import pRetry from "p-retry";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import type {
  CommandResult,
  DirectTcpChannelOptions,
  HostWithSecret,
  ShellOptions,
} from "./ssh-types";
import { createProxySocket, expandHome, resolveSshConfig, sshConnectionKey } from "./ssh-config";
import { SSH_CONNECTION_CLOSED_BEFORE_READY, withSshConnectRetries } from "./ssh-connect-retry";
import { isConnectionLevelSshError } from "./ssh-errors";
import { SftpChannelPool } from "./ssh-sftp";
import { currentGatewayUserId } from "../state/memory";

const SSH_READY_TIMEOUT_MS = 30_000;
const SSH_KEEPALIVE_INTERVAL_MS = 30_000;
const SSH_KEEPALIVE_COUNT_MAX = 10;

export class SshConnectionPool {
  private clients = new Map<string, Promise<Client>>();
  private sftpChannels = new SftpChannelPool();
  private hostKeysByUser = new Map<string, Map<number, string>>();

  connect(host: HostWithSecret): Promise<Client> {
    const resolved = resolveSshConfig(host);
    const key = sshConnectionKey(host, resolved);
    this.scopedHostKeys().set(host.id, key);

    const existing = this.clients.get(key);
    if (existing) {
      return existing;
    }

    const promise = withSshConnectRetries(host, () => this.connectOnce(host, resolved, key)).catch(
      (error) => {
        this.clients.delete(key);
        throw error;
      },
    );

    this.clients.set(key, promise);
    return promise;
  }

  async exec(host: HostWithSecret, command: string): Promise<CommandResult> {
    const channel = await this.execChannel(host, command);

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      channel.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      channel.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      channel.on("error", reject);
      channel.on("close", (code: number | null) => {
        resolve({ code, stdout, stderr });
      });
    });
  }

  async execChannel(
    host: HostWithSecret,
    command: string,
    retried = false,
  ): Promise<ClientChannel> {
    const client = await this.connect(host);

    return new Promise((resolve, reject) => {
      client.exec(command, (error, channel) => {
        if (error) {
          this.disconnectHost(host);
          if (!retried && isConnectionLevelSshError(error)) {
            void this.execChannel(host, command, true).then(resolve, reject);
            return;
          }
          reject(error);
          return;
        }
        resolve(channel);
      });
    });
  }

  async openShell(
    host: HostWithSecret,
    options: ShellOptions,
    retried = false,
  ): Promise<ClientChannel> {
    const client = await this.connect(host);

    return new Promise((resolve, reject) => {
      client.shell(
        {
          term: options.term,
          cols: options.cols,
          rows: options.rows,
        },
        (error, channel) => {
          if (error) {
            this.disconnectHost(host);
            if (!retried && isConnectionLevelSshError(error)) {
              void this.openShell(host, options, true).then(resolve, reject);
              return;
            }
            reject(error);
            return;
          }
          resolve(channel);
        },
      );
    });
  }

  async openTcpChannel(
    host: HostWithSecret,
    target: DirectTcpChannelOptions,
    retried = false,
  ): Promise<ClientChannel> {
    const client = await this.connect(host);
    return new Promise((resolve, reject) => {
      client.forwardOut("127.0.0.1", 0, target.host, target.port, (error, channel) => {
        if (!error) {
          resolve(channel);
          return;
        }
        if (!retried && isConnectionLevelSshError(error)) {
          this.disconnectHost(host);
          void this.openTcpChannel(host, target, true).then(resolve, reject);
          return;
        }
        reject(error);
      });
    });
  }

  sftp(host: HostWithSecret): Promise<SFTPWrapper> {
    const resolved = resolveSshConfig(host);
    const key = sshConnectionKey(host, resolved);
    this.scopedHostKeys().set(host.id, key);
    return this.sftpChannels.get(host, key, () => this.connect(host));
  }

  async uploadFile(host: HostWithSecret, localPath: string, remotePath: string) {
    const sftp = await this.sftp(host);
    await new Promise<void>((resolve, reject) => {
      const reader = createReadStream(localPath);
      const writer = sftp.createWriteStream(remotePath, { mode: 0o600 });
      reader.on("error", reject);
      writer.on("error", reject);
      writer.on("close", resolve);
      reader.pipe(writer);
    });
    return remotePath;
  }

  async uploadFileResumable(host: HostWithSecret, localPath: string, remotePath: string) {
    const localSize = (await statLocal(localPath)).size;
    // Keep the partial file across reconnects, but expose the final name only after size validation.
    const partialPath = `${remotePath}.part`;

    await pRetry(
      async () => {
        try {
          const sftp = await this.sftp(host);
          let offset = await remoteFileSize(sftp, partialPath);
          if (offset > localSize) {
            await unlinkRemoteFile(sftp, partialPath);
            offset = 0;
          }
          if (offset < localSize) {
            const reader = createReadStream(localPath, { start: offset });
            const writer = sftp.createWriteStream(partialPath, {
              flags: offset > 0 ? "r+" : "w",
              mode: 0o600,
              start: offset,
            });
            await pipeline(reader, writer);
          }
          const uploadedSize = await remoteFileSize(sftp, partialPath);
          if (uploadedSize !== localSize) {
            throw new Error(
              `Incomplete SFTP upload for ${remotePath}: ${uploadedSize}/${localSize} bytes`,
            );
          }
          await renameRemoteFile(sftp, partialPath, remotePath);
        } catch (error) {
          if (isTransientSftpTransferError(error)) this.disconnectHost(host);
          throw error;
        }
      },
      {
        retries: 4,
        minTimeout: 1_000,
        factor: 2,
        shouldRetry: ({ error }) => isTransientSftpTransferError(error),
        onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
          console.info("[gateway-ssh] retrying resumable SFTP upload", {
            hostId: host.id,
            hostName: host.name,
            attempt: attemptNumber,
            retriesLeft,
            message: error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
    return remotePath;
  }

  syncHosts(hosts: HostWithSecret[]) {
    const scopedHostKeys = this.scopedHostKeys();
    const previousKeys = new Set(scopedHostKeys.values());
    const activeKeys = new Set<string>();
    scopedHostKeys.clear();
    for (const host of hosts) {
      const key = sshConnectionKey(host, resolveSshConfig(host));
      activeKeys.add(key);
      scopedHostKeys.set(host.id, key);
    }

    for (const key of previousKeys) {
      if (!activeKeys.has(key) && !this.isReferenced(key)) {
        this.disconnectKey(key);
      }
    }
  }

  disconnectHost(host: HostWithSecret) {
    const key =
      this.scopedHostKeys().get(host.id) ?? sshConnectionKey(host, resolveSshConfig(host));
    this.disconnectKey(key);
  }

  disconnect(hostId: number) {
    const scopedHostKeys = this.scopedHostKeys();
    const key = scopedHostKeys.get(hostId);
    if (key) {
      scopedHostKeys.delete(hostId);
      if (!this.isReferenced(key)) {
        this.disconnectKey(key);
      }
    }
  }

  private disconnectKey(key: string) {
    this.sftpChannels.close(key);
    const client = this.clients.get(key);
    this.clients.delete(key);
    void client?.then((connection) => connection.end()).catch(() => {});
  }

  private scopedHostKeys() {
    const scope = this.userScopeKey();
    let hostKeys = this.hostKeysByUser.get(scope);
    if (!hostKeys) {
      hostKeys = new Map();
      this.hostKeysByUser.set(scope, hostKeys);
    }
    return hostKeys;
  }

  private userScopeKey() {
    return String(currentGatewayUserId() ?? "anonymous");
  }

  private isReferenced(key: string) {
    for (const hostKeys of this.hostKeysByUser.values()) {
      for (const referencedKey of hostKeys.values()) {
        if (referencedKey === key) {
          return true;
        }
      }
    }
    return false;
  }

  private async connectOnce(
    host: HostWithSecret,
    resolved: ReturnType<typeof resolveSshConfig>,
    key: string,
  ) {
    const sock = resolved.proxy
      ? await createProxySocket({
          proxy: resolved.proxy,
          targetHost: resolved.hostName,
          targetPort: host.port ?? resolved.port,
        })
      : undefined;
    const client = new Client();
    return await new Promise<Client>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        this.clients.delete(key);
        sock?.destroy();
        client.end();
        reject(error);
      };
      client
        .on("ready", () => {
          settled = true;
          resolve(client);
        })
        .on("error", fail)
        .on("end", () => this.clients.delete(key))
        .on("close", () => {
          this.clients.delete(key);
          fail(new Error(SSH_CONNECTION_CLOSED_BEFORE_READY));
        })
        .connect({
          host: sock ? undefined : resolved.hostName,
          sock,
          username: host.username ?? resolved.username,
          port: sock ? undefined : (host.port ?? resolved.port),
          agent: host.authMode === "agent" ? process.env.SSH_AUTH_SOCK : undefined,
          password: host.authMode === "password" ? (host.password ?? undefined) : undefined,
          privateKey: host.privateKey
            ? Buffer.from(host.privateKey)
            : resolved.privateKeyPath
              ? readFileSync(expandHome(resolved.privateKeyPath))
              : undefined,
          readyTimeout: SSH_READY_TIMEOUT_MS,
          keepaliveInterval: SSH_KEEPALIVE_INTERVAL_MS,
          keepaliveCountMax: SSH_KEEPALIVE_COUNT_MAX,
        });
    });
  }
}

async function remoteFileSize(sftp: SFTPWrapper, path: string) {
  return await new Promise<number>((resolve, reject) => {
    sftp.stat(path, (error, stats) => {
      if (!error) {
        resolve(stats.size);
        return;
      }
      if (isMissingSftpFile(error)) {
        resolve(0);
        return;
      }
      reject(error);
    });
  });
}

async function unlinkRemoteFile(sftp: SFTPWrapper, path: string) {
  await new Promise<void>((resolve, reject) => {
    sftp.unlink(path, (error) => (error && !isMissingSftpFile(error) ? reject(error) : resolve()));
  });
}

async function renameRemoteFile(sftp: SFTPWrapper, from: string, to: string) {
  await new Promise<void>((resolve, reject) => {
    sftp.rename(from, to, (error) => (error ? reject(error) : resolve()));
  });
}

function isMissingSftpFile(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 2;
}

function isTransientSftpTransferError(error: unknown) {
  if (isConnectionLevelSshError(error)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /SSH channel closed|socket hang up|ECONNRESET|EPIPE|ETIMEDOUT|Incomplete SFTP upload/i.test(
    message,
  );
}
