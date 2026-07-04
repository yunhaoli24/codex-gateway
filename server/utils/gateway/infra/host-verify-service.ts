import { hostLifecycleBus } from "../state/host-events";
import { codexRemoteAppServerVerifyPayload, remoteLoginShellCommand } from "./remote-command";
import type { SshConnectionPool } from "./ssh-connection";
import type { HostWithSecret, RemoteCodexVersionState } from "./ssh-types";

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

    const { CodexRpcClient } = await import("./rpc");
    const client = new CodexRpcClient(host);
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
