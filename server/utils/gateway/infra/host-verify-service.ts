import { hostLifecycleBus } from "../state/host-events";
import { codexRemoteAppServerVerifyPayload, remoteLoginShellCommand } from "./ssh/remote-command";
import type { SshConnectionPool } from "./ssh/ssh-connection";
import type { HostWithSecret, RemoteCodexVersionState } from "./ssh/ssh-types";

export type EnsureCodexVersion = (host: HostWithSecret) => Promise<RemoteCodexVersionState>;

export class HostVerifyService {
  constructor(
    private readonly ssh: SshConnectionPool,
    private readonly ensureCodexVersion: EnsureCodexVersion,
  ) {}

  async verify(host: HostWithSecret) {
    const versionState = await this.ensureCodexVersion(host);
    const probe = await this.ssh.exec(
      host,
      remoteLoginShellCommand(codexRemoteAppServerVerifyPayload()),
    );
    if (probe.code !== 0) {
      return {
        ok: false,
        code: probe.code,
        stdout: probe.stdout.trim(),
        stderr: probe.stderr.trim(),
      };
    }

    // Verification is a short-lived lease of the same connection, not a second proxy that
    // duplicates notifications while the host's normal runtime is already connected.
    const { SharedCodexClient } = await import("./rpc/shared-codex-client");
    const client = new SharedCodexClient(host);
    try {
      await client.connect();
      const threads = await client.request(
        "thread/list",
        { limit: 1, useStateDbOnly: true },
        30_000,
      );
      const stdout = [
        versionState.upgraded
          ? `Upgraded Codex ${versionState.beforeVersion} -> ${versionState.version}`
          : null,
        probe.stdout.trim(),
        "app-server RPC OK",
      ]
        .filter(Boolean)
        .join("\n");
      hostLifecycleBus.emit({
        hostId: host.id,
        status: "connected",
        message: stdout,
      });
      return {
        ok: true,
        code: 0,
        stdout,
        stderr: probe.stderr.trim(),
        codexVersion: versionState.version,
        appServerVersion: versionState.appServerVersion,
        supportedCodexVersion: versionState.supportedVersion,
        upgraded: versionState.upgraded,
        threads,
      };
    } finally {
      client.close();
    }
  }
}
