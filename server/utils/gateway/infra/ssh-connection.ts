import { createReadStream, readFileSync } from "node:fs";
import { Client, type ClientChannel } from "ssh2";
import type { CommandResult, HostWithSecret } from "./ssh-types";
import { createProxySocket, expandHome, resolveSshConfig, sshConnectionKey } from "./ssh-config";

export class SshConnectionPool {
  private clients = new Map<string, Promise<Client>>();
  private hostKeys = new Map<number, string>();

  connect(host: HostWithSecret): Promise<Client> {
    const resolved = resolveSshConfig(host);
    const key = sshConnectionKey(host, resolved);
    this.hostKeys.set(host.id, key);

    const existing = this.clients.get(key);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      const sock = resolved.proxy
        ? await createProxySocket({
            proxy: resolved.proxy,
            targetHost: resolved.hostName,
            targetPort: host.port ?? resolved.port,
          })
        : undefined;
      const client = new Client();
      return await new Promise<Client>((resolve, reject) => {
        client
          .on("ready", () => resolve(client))
          .on("error", (error) => {
            this.clients.delete(key);
            reject(error);
          })
          .on("end", () => this.clients.delete(key))
          .on("close", () => this.clients.delete(key))
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
            readyTimeout: 15_000,
            keepaliveInterval: 15_000,
            keepaliveCountMax: 3,
          });
      });
    })().catch((error) => {
      this.clients.delete(key);
      throw error;
    });

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

  async uploadFile(host: HostWithSecret, localPath: string, remotePath: string) {
    const client = await this.connect(host);
    await new Promise<void>((resolve, reject) => {
      client.sftp((error, sftp) => {
        if (error) {
          reject(error);
          return;
        }

        const reader = createReadStream(localPath);
        const writer = sftp.createWriteStream(remotePath, { mode: 0o600 });
        const cleanup = () => {
          sftp.end();
        };
        reader.on("error", (streamError) => {
          cleanup();
          reject(streamError);
        });
        writer.on("error", (streamError) => {
          cleanup();
          reject(streamError);
        });
        writer.on("close", () => {
          cleanup();
          resolve();
        });
        reader.pipe(writer);
      });
    });
    return remotePath;
  }

  syncHosts(hosts: HostWithSecret[]) {
    const activeKeys = new Set<string>();
    this.hostKeys.clear();
    for (const host of hosts) {
      const key = sshConnectionKey(host, resolveSshConfig(host));
      activeKeys.add(key);
      this.hostKeys.set(host.id, key);
    }

    for (const [key, client] of this.clients) {
      if (!activeKeys.has(key)) {
        this.clients.delete(key);
        void client.then((connection) => connection.end()).catch(() => {});
      }
    }
  }

  disconnectHost(host: HostWithSecret) {
    const key = this.hostKeys.get(host.id) ?? sshConnectionKey(host, resolveSshConfig(host));
    this.disconnectKey(key);
  }

  disconnect(hostId: number) {
    const key = this.hostKeys.get(hostId);
    if (key) {
      this.disconnectKey(key);
      this.hostKeys.delete(hostId);
    }
  }

  private disconnectKey(key: string) {
    const client = this.clients.get(key);
    this.clients.delete(key);
    void client?.then((connection) => connection.end()).catch(() => {});
  }
}

function isConnectionLevelSshError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /No response from server|Not connected|Connection lost|Channel open failure|ECONNRESET|EPIPE/i.test(
    message,
  );
}
