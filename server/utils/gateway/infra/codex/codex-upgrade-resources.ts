import type { CodexArtifactProvider } from "./codex-artifacts";
import type { SshConnectionPool } from "../ssh/ssh-connection";
import type { HostWithSecret } from "../ssh/ssh-types";
import { remoteLoginShellCommand } from "../ssh/remote-command";
import {
  codexRemoteCreateUpgradeStagePayload,
  codexRemoteCleanupUpgradeStagePayload,
} from "./codex-upgrade-remote";
import { codexUpgradeError } from "./codex-upgrade-log";

export type CodexArtifactLease = Awaited<ReturnType<CodexArtifactProvider["acquire"]>>;

// Leases are workflow-local; staged bytes belong to the archive digest, not the attempt. Failed
// workflows release their local lease but retain the remote partial for the next connection.
export class CodexUpgradeResources {
  artifactLease: CodexArtifactLease | null = null;
  private stagePath: string | null = null;

  constructor(
    private readonly ssh: SshConnectionPool,
    private readonly host: HostWithSecret,
  ) {}

  async stage(sha256: string) {
    if (this.stagePath !== null) return this.stagePath;
    const result = await this.ssh.exec(
      this.host,
      remoteLoginShellCommand(codexRemoteCreateUpgradeStagePayload(sha256)),
      { timeoutMs: 30_000 },
    );
    const path = result.stdout.trim();
    if (
      result.code !== 0 ||
      !/^\/[A-Za-z0-9_./-]+\/\.cache\/codex-gateway\/upgrades\/upgrade\.[a-f0-9]{64}$/.test(path)
    ) {
      throw new Error(
        result.stderr || result.stdout || "Failed to create remote upgrade staging directory",
      );
    }
    this.stagePath = path;
    return path;
  }

  async dispose(completed: boolean) {
    try {
      if (completed && this.stagePath !== null) {
        await this.ssh.exec(
          this.host,
          remoteLoginShellCommand(codexRemoteCleanupUpgradeStagePayload(this.stagePath)),
          { timeoutMs: 30_000 },
        );
      }
    } catch (error) {
      codexUpgradeError("remote staging cleanup failed", this.host, error);
    } finally {
      this.artifactLease?.release();
      this.artifactLease = null;
      this.stagePath = null;
    }
  }
}
