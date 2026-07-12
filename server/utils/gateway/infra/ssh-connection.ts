import { createReadStream, readFileSync } from "node:fs";
import { connect as connectTcp } from "node:net";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import type {
  CommandResult,
  DirectTcpChannelOptions,
  HostWithSecret,
  ReverseTcpForwardOptions,
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

  async withReverseTcpForward<T>(
    host: HostWithSecret,
    options: ReverseTcpForwardOptions,
    callback: (remotePort: number) => Promise<T>,
  ) {
    const client = await this.connect(host);
    const remotePort = await this.forwardIn(client, options.remoteHost, options.remotePort);
    const listener = (
      details: {
        destIP: string;
        destPort: number;
      },
      accept: () => ClientChannel,
      reject: () => void,
    ) => {
      if (details.destPort !== remotePort) {
        reject();
        return;
      }
      const channel = accept();
      const upstream = connectTcp(options.targetPort, options.targetHost);
      channel.pipe(upstream);
      upstream.pipe(channel);
      upstream.on("error", () => channel.close());
      channel.on("error", () => upstream.destroy());
      channel.on("close", () => upstream.destroy());
    };

    client.on("tcp connection", listener);
    try {
      return await callback(remotePort);
    } finally {
      client.off("tcp connection", listener);
      await this.closeReverseTcpForward(client, options.remoteHost, remotePort);
    }
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

  private async forwardIn(client: Client, remoteHost: string, remotePort: number) {
    return await new Promise<number>((resolve, reject) => {
      client.forwardIn(remoteHost, remotePort, (error, assignedPort) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(assignedPort || remotePort);
      });
    });
  }

  private async unforwardIn(client: Client, remoteHost: string, remotePort: number) {
    await new Promise<void>((resolve, reject) => {
      client.unforwardIn(remoteHost, remotePort, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async closeReverseTcpForward(client: Client, remoteHost: string, remotePort: number) {
    try {
      await this.unforwardIn(client, remoteHost, remotePort);
    } catch (error) {
      if (!isConnectionLevelSshError(error)) {
        throw error;
      }
    }
  }
}
