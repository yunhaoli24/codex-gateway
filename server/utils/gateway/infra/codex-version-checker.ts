import { hostLifecycleBus } from "../state/host-events";
import { parseCodexVersion, SUPPORTED_CODEX_VERSION } from "./codex-version";
import { isRecoverableCodexInstallError } from "./codex-install-errors";
import { codexRemoteVersionPayload, remoteLoginShellCommand } from "./remote-command";
import type { SshConnectionPool } from "./ssh-connection";
import type { HostWithSecret } from "./ssh-types";

export class CodexVersionChecker {
  constructor(private readonly ssh: SshConnectionPool) {}

  async readVersion(host: HostWithSecret) {
    const result = await this.ssh.exec(host, remoteLoginShellCommand(codexRemoteVersionPayload()));
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || "Failed to read remote Codex version");
    }
    const parsed = parseCodexVersion(result.stdout);
    if (!parsed) {
      throw new Error(`Unable to parse remote Codex version: ${result.stdout.trim()}`);
    }
    return parsed.version;
  }

  async readVersionOrRecoverableMissing(host: HostWithSecret) {
    try {
      return await this.readVersion(host);
    } catch (error) {
      if (!isRecoverableCodexInstallError(error)) {
        throw error;
      }
      hostLifecycleBus.emit({
        hostId: host.id,
        status: "upgrading",
        message: `${hostDisplayName(host)} 的远端 Codex 安装缺失或损坏，正在重新安装 ${SUPPORTED_CODEX_VERSION}`,
      });
      return "0.0.0";
    }
  }
}

function hostDisplayName(host: HostWithSecret) {
  return host.name || host.sshHost;
}
