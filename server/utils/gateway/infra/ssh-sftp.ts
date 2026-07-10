import type { Client, SFTPWrapper } from "ssh2";
import type { HostWithSecret } from "./ssh-types";
import { isConnectionLevelSshError } from "./ssh-errors";

const SFTP_OPEN_ATTEMPTS = 3;

export class SftpChannelPool {
  private channels = new Map<string, Promise<SFTPWrapper>>();

  get(host: HostWithSecret, key: string, connect: () => Promise<Client>) {
    const existing = this.channels.get(key);
    if (existing) return existing;

    const pending = this.open(host, connect).catch((error) => {
      if (this.channels.get(key) === pending) this.channels.delete(key);
      throw error;
    });
    this.channels.set(key, pending);

    void pending
      .then((channel) => {
        const invalidate = () => {
          if (this.channels.get(key) === pending) this.channels.delete(key);
        };
        channel.once("close", invalidate);
        channel.once("end", invalidate);
        channel.once("error", invalidate);
      })
      .catch(() => {});

    return pending;
  }

  close(key: string) {
    const pending = this.channels.get(key);
    this.channels.delete(key);
    void pending?.then((channel) => channel.end()).catch(() => {});
  }

  private async open(host: HostWithSecret, connect: () => Promise<Client>) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= SFTP_OPEN_ATTEMPTS; attempt += 1) {
      try {
        const client = await connect();
        return await new Promise<SFTPWrapper>((resolve, reject) => {
          client.sftp((error, channel) => (error ? reject(error) : resolve(channel)));
        });
      } catch (error) {
        lastError = error;
        if (attempt >= SFTP_OPEN_ATTEMPTS || !isConnectionLevelSshError(error)) throw error;
        console.info("[gateway-ssh] retrying SFTP channel open", {
          hostId: host.id,
          hostName: host.name,
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: SFTP_OPEN_ATTEMPTS,
          message: error instanceof Error ? error.message : String(error),
        });
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
    throw lastError;
  }
}
