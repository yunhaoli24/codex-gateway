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

// One workflow owns these resources across queue attempts. Rebuilding the tarball can change its
// bytes even at the same version, so a resumed .part must keep the exact original local artifact.
export class CodexUpgradeResources {
  artifactLease: CodexArtifactLease | null = null;
  private stagePath: string | null = null;

  constructor(
    private readonly ssh: SshConnectionPool,
    private readonly host: HostWithSecret,
  ) {}

  async stage() {
    if (this.stagePath !== null) return this.stagePath;
    const result = await this.ssh.exec(
      this.host,
      remoteLoginShellCommand(codexRemoteCreateUpgradeStagePayload()),
      { timeoutMs: 30_000 },
    );
    const path = result.stdout.trim();
    if (
      result.code !== 0 ||
      !/^\/[A-Za-z0-9_./-]+\/\.cache\/codex-gateway\/upgrades\/upgrade\.[A-Za-z0-9]+$/.test(path)
    ) {
      throw new Error(
        result.stderr || result.stdout || "Failed to create remote upgrade staging directory",
      );
    }
    this.stagePath = path;
    return path;
  }

  async dispose() {
    try {
      if (this.stagePath !== null) {
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
