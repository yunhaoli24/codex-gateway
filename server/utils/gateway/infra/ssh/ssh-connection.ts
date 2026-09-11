import { readFileSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
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
import { uploadFile, uploadFileResumable } from "./ssh-transfer";
import { currentGatewayUserId } from "../../state/memory";
import { EventEmitter } from "@posva/event-emitter";
import { SshBackgroundTaskScheduler } from "./ssh-background-tasks";
import { hostMfaManager } from "../../host-mfa/host-mfa-instance";

const SSH_READY_TIMEOUT_MS = 30_000;
const SSH_KEEPALIVE_INTERVAL_MS = 30_000;
const SSH_KEEPALIVE_COUNT_MAX = 10;

interface ExecOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  maxOutputBytes?: number;
}

function abortReason(signal: AbortSignal | undefined) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new Error("Remote command was aborted", { cause: signal?.reason });
}

function outputLimitExceeded(outputBytes: number, maxOutputBytes: number | undefined) {
  return maxOutputBytes !== undefined && outputBytes > maxOutputBytes;
}

function outputLimitError(maxOutputBytes: number | undefined) {
  return new Error(`Remote command output exceeded the ${maxOutputBytes ?? 0} byte limit`);
}

type SshConnectionPoolEvents = {
  ready: { userId: number; host: HostWithSecret };
};

export class SshConnectionPool extends EventEmitter<SshConnectionPoolEvents> {
  private clients = new Map<string, Promise<Client>>();
  private clientTokens = new Map<string, symbol>();
  private sftpChannels = new SftpChannelPool();
  private hostKeysByUser = new Map<string, Map<number, string>>();
  private backgroundTasks = new SshBackgroundTaskScheduler();

  constructor() {
    super();
  }

  connect(host: HostWithSecret): Promise<Client> {
    const resolved = resolveSshConfig(host);
    const key = this.connectionKeyFor(host);
    this.scopedHostKeys().set(host.id, key);

    const existing = this.clients.get(key);
    if (existing) return this.notifyReady(existing, host);

    const token = Symbol(key);
    this.clientTokens.set(key, token);
    const promise = withSshConnectRetries(host, () =>
      this.connectOnce(host, resolved, key, token),
    ).catch((error) => {
      this.deleteClientIfCurrent(key, token);
      throw error;
    });

    this.clients.set(key, promise);
    return this.notifyReady(promise, host);
  }

  async execChannelIfConnected(host: HostWithSecret, command: string) {
    const key = this.connectionKeyFor(host);
    const connection = this.clients.get(key);
    if (connection === undefined) return null;
    const client = await connection;
    return await new Promise<ClientChannel>((resolve, reject) => {
      client.exec(command, (error, channel) => (error ? reject(error) : resolve(channel)));
    });
  }

  runBackground<Result>(host: HostWithSecret, task: () => Promise<Result>) {
    const connectionKey = this.connectionKeyFor(host);
    // The Client pool itself is keyed by the resolved remote identity and credentials. Use that
    // same key here: two Gateway users with identical credentials share one physical SSH transport,
    // so their best-effort collectors must share its background bulkhead as well.
    return this.backgroundTasks.run(connectionKey, task);
  }

  connectionKeyFor(host: HostWithSecret) {
    const key = sshConnectionKey(host, resolveSshConfig(host));
    // A keyboard-interactive challenge is part of the user's SSH authentication, so the
    // transport must never be shared across Gateway users. Scoping every transport consistently
    // also keeps the key stable when the first challenge changes a host's runtime MFA state.
    return `${key}:gateway-user:${currentGatewayUserId() ?? "anonymous"}`;
  }

  async exec(
    host: HostWithSecret,
    command: string,
    options: ExecOptions = {},
  ): Promise<CommandResult> {
    const startedAt = Date.now();
    const channel = await this.openExecChannelWithin(
      host,
      command,
      options.timeoutMs,
      options.signal,
    );
    const remainingMs =
      options.timeoutMs === undefined
        ? undefined
        : Math.max(0, options.timeoutMs - (Date.now() - startedAt));

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      const stdoutDecoder = new StringDecoder("utf8");
      const stderrDecoder = new StringDecoder("utf8");
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        callback();
      };
      const abort = () => {
        finish(() => reject(abortReason(options.signal)));
        channel.close();
      };
      const timer =
        remainingMs === undefined
          ? undefined
          : setTimeout(() => {
              finish(() =>
                reject(new Error(`Remote command timed out after ${options.timeoutMs}ms`)),
              );
              channel.close();
            }, remainingMs);
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted === true) {
        abort();
        return;
      }
      channel.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputLimitExceeded(outputBytes, options.maxOutputBytes)) {
          finish(() => reject(outputLimitError(options.maxOutputBytes)));
          channel.close();
          return;
        }
        stdout += stdoutDecoder.write(chunk);
      });
      channel.stderr.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputLimitExceeded(outputBytes, options.maxOutputBytes)) {
          finish(() => reject(outputLimitError(options.maxOutputBytes)));
          channel.close();
          return;
        }
        stderr += stderrDecoder.write(chunk);
      });
      channel.on("error", (error: Error) => finish(() => reject(error)));
      channel.on("close", (code: number | null) => {
        finish(() => {
          stdout += stdoutDecoder.end();
          stderr += stderrDecoder.end();
          resolve({ code, stdout, stderr });
        });
      });
    });
  }

  private async openExecChannelWithin(
    host: HostWithSecret,
    command: string,
    timeoutMs: number | undefined,
    signal: AbortSignal | undefined,
  ) {
    if (timeoutMs === undefined && signal === undefined)
      return await this.execChannel(host, command);
    return await new Promise<ClientChannel>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const abort = () => fail(abortReason(signal));
      const timer =
        timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              fail(new Error(`Remote command timed out after ${timeoutMs}ms`));
            }, timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted === true) {
        abort();
        return;
      }
      void this.execChannel(host, command).then(
        (channel) => {
          if (settled) {
            // A timed-out channel request can still be admitted later by ssh2. Close that late
            // channel so it cannot consume a slot on the shared transport indefinitely.
            channel.close();
            return;
          }
          settled = true;
          cleanup();
          resolve(channel);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(
            error instanceof Error
              ? error
              : new Error("Failed to open remote command channel", { cause: error }),
          );
        },
      );
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
          // Channel admission failures such as MaxSessions do not mean the shared transport died.
          // Disconnecting here would also tear down App Server, terminals, and file operations.
          if (!retried && isConnectionLevelSshError(error)) {
            this.disconnectHost(host);
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
            // Keep the shared connection for channel-local failures; only transport errors justify
            // reconnecting every service that shares this Client.
            if (!retried && isConnectionLevelSshError(error)) {
              this.disconnectHost(host);
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
    const key = this.connectionKeyFor(host);
    this.scopedHostKeys().set(host.id, key);
    return this.sftpChannels.get(host, key, () => this.connect(host));
  }

  async uploadFile(host: HostWithSecret, localPath: string, remotePath: string) {
    return await uploadFile(this, host, localPath, remotePath);
  }

  closeSftp(host: HostWithSecret) {
    this.sftpChannels.close(this.connectionKeyFor(host));
  }

  async uploadFileResumable(host: HostWithSecret, localPath: string, remotePath: string) {
    return await uploadFileResumable(this, host, localPath, remotePath);
  }

  syncHosts(hosts: HostWithSecret[]) {
    const scopedHostKeys = this.scopedHostKeys();
    const previousKeys = new Set(scopedHostKeys.values());
    const activeKeys = new Set<string>();
    scopedHostKeys.clear();
    for (const host of hosts) {
      const key = this.connectionKeyFor(host);
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
    const key = this.scopedHostKeys().get(host.id) ?? this.connectionKeyFor(host);
    this.disconnectKey(key);
  }

  disconnect(hostId: number) {
    const scopedHostKeys = this.scopedHostKeys();
    const key = scopedHostKeys.get(hostId);
    if (key !== undefined) {
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
    this.clientTokens.delete(key);
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
    token: symbol,
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
        this.deleteClientIfCurrent(key, token);
        sock?.destroy();
        client.end();
        reject(error);
      };

      // Capture the user scope at connection time for use in async MFA callbacks
      const mfaUserId = currentGatewayUserId();

      client
        .on("ready", () => {
          if (this.clientTokens.get(key) !== token) {
            fail(new Error("SSH connection attempt was superseded by Host reconfiguration"));
            return;
          }
          settled = true;
          resolve(client);
        })
        .on("error", fail)
        .on("end", () => this.deleteClientIfCurrent(key, token))
        .on("close", () => {
          this.deleteClientIfCurrent(key, token);
          fail(new Error(SSH_CONNECTION_CLOSED_BEFORE_READY));
        })
        .on("keyboard-interactive", (name, instructions, _lang, prompts, finish) => {
          // PAM may follow the actual verification-code challenge with an informational
          // keyboard-interactive round that contains no prompts. It requires an empty response,
          // not another user interaction; publishing it as MFA would leave the Host falsely
          // marked as waiting after authentication has already succeeded.
          if (prompts.length === 0) {
            finish([]);
            return;
          }
          if (mfaUserId === null) {
            // No authenticated user scope — fall back to empty answers, which will likely
            // cause authentication to fail so the client can retry with a different method.
            finish([]);
            return;
          }

          hostMfaManager
            .requestMfa(mfaUserId, host.id, host.name, instructions, prompts)
            .then((answers) => {
              if (this.clientTokens.get(key) !== token) {
                finish([]);
                return;
              }
              finish(answers);
            })
            .catch(() => {
              // MFA timed out or was canceled — give empty answers so auth fails
              finish([]);
            });
        })
        .connect({
          host: sock ? undefined : resolved.hostName,
          sock,
          username: host.username ?? resolved.username,
          port: sock ? undefined : (host.port ?? resolved.port),
          agent: host.authMode === "agent" ? process.env.SSH_AUTH_SOCK : undefined,
          password: host.authMode === "password" ? (host.password ?? undefined) : undefined,
          privateKey:
            host.privateKey !== null && host.privateKey !== undefined && host.privateKey !== ""
              ? Buffer.from(host.privateKey)
              : resolved.privateKeyPath !== null &&
                  resolved.privateKeyPath !== undefined &&
                  resolved.privateKeyPath !== ""
                ? readFileSync(expandHome(resolved.privateKeyPath))
                : undefined,
          readyTimeout: SSH_READY_TIMEOUT_MS,
          keepaliveInterval: SSH_KEEPALIVE_INTERVAL_MS,
          keepaliveCountMax: SSH_KEEPALIVE_COUNT_MAX,
          tryKeyboard: true,
        });
    });
  }

  private async notifyReady(connection: Promise<Client>, host: HostWithSecret) {
    const client = await connection;
    const userId = currentGatewayUserId();
    if (userId !== null) this.emit("ready", { userId, host });
    return client;
  }

  private deleteClientIfCurrent(key: string, token: symbol) {
    if (this.clientTokens.get(key) !== token) return;
    this.clientTokens.delete(key);
    this.clients.delete(key);
    this.sftpChannels.close(key);
  }
}
