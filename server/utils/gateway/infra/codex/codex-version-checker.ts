import { hostLifecycleBus } from "../../state/host-events";
import { parseCodexVersion, SUPPORTED_CODEX_VERSION } from "./codex-version";
import { isRecoverableCodexInstallError } from "./codex-install-errors";
import { codexRemoteVersionPayload, remoteLoginShellCommand } from "../ssh/remote-command";
import type { SshConnectionPool } from "../ssh/ssh-connection";
import type { HostWithSecret } from "../ssh/ssh-types";

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
    const installationLayout = result.stdout.includes("installation-layout standalone")
      ? "standalone"
      : "npm-or-external";
    return { version: parsed.version, installationLayout } as const;
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
        messageTranslation: {
          key: "repairingInstallation",
          values: { host: hostDisplayName(host), version: SUPPORTED_CODEX_VERSION },
        },
      });
      return { version: "0.0.0", installationLayout: "npm-or-external" } as const;
    }
  }
}

function hostDisplayName(host: HostWithSecret) {
  return host.name || host.sshHost;
}
