import type { HostWithSecret, RemoteCodexVersionState } from "../ssh/ssh-types";
import { isRecoverableCodexInstallError } from "./codex-install-errors";
import { SUPPORTED_CODEX_VERSION } from "./codex-version";
import { hostLifecycleBus } from "../../state/host-events";
import { currentGatewayUserId } from "../../state/memory";
import type { SshConnectionPool } from "../ssh/ssh-connection";
import { CodexDaemon } from "./codex-daemon";
import { CodexUpgrader } from "./codex-upgrader";
import { CodexUpgradeWorkflow } from "./codex-upgrade-workflow";
import { CodexVersionChecker } from "./codex-version-checker";
import { HostVerifyService } from "../host-verify-service";

export class CodexRuntimeService {
  private readonly versionChecks = new Map<string, Promise<RemoteCodexVersionState>>();
  private readonly failedVersionChecks = new Map<string, { error: unknown; retryAt: number }>();
  private readonly upgradeWorkflow: CodexUpgradeWorkflow;
  private readonly verifier: HostVerifyService;

  constructor(ssh: SshConnectionPool) {
    this.upgradeWorkflow = new CodexUpgradeWorkflow(
      new CodexDaemon(ssh),
      new CodexUpgrader(ssh),
      new CodexVersionChecker(ssh),
    );
    this.verifier = new HostVerifyService(ssh, (host) => this.ensureCodexVersion(host));
  }

  async verify(host: HostWithSecret) {
    return await this.verifier.verify(host);
  }

  async ensureCodexVersion(host: HostWithSecret): Promise<RemoteCodexVersionState> {
    const key = this.hostKey(host.id);
    const existing = this.versionChecks.get(key);
    if (existing) {
      return existing;
    }

    const failed = this.failedVersionChecks.get(key);
    if (failed !== undefined) {
      if (failed.retryAt > Date.now()) {
        // A failed SSH probe can be triggered by several browser requests at once. Reusing the
        // short-lived failure prevents each request from opening another SSH/upgrade attempt while
        // the remote host or its proxy path is unavailable.
        throw failed.error;
      }
      this.failedVersionChecks.delete(key);
    }

    const check = this.checkAndUpgradeCodex(host)
      .then((result) => {
        this.failedVersionChecks.delete(key);
        return result;
      })
      .catch((error: unknown) => {
        this.failedVersionChecks.set(key, {
          error,
          retryAt: Date.now() + VERSION_CHECK_FAILURE_COOLDOWN_MS,
        });
        throw error;
      })
      .finally(() => this.versionChecks.delete(key));
    this.versionChecks.set(key, check);
    return check;
  }

  async checkAndUpgradeCodex(host: HostWithSecret): Promise<RemoteCodexVersionState> {
    try {
      hostLifecycleBus.emit({
        hostId: host.id,
        status: "checkingVersion",
        message: `正在检查 ${hostDisplayName(host)} 的远端 Codex 版本`,
      });
      return await this.upgradeWorkflow.ensure(host);
    } catch (error) {
      hostLifecycleBus.emit({
        hostId: host.id,
        status: "failed",
        message: messageFromError(error),
      });
      throw error;
    }
  }

  clearVersionCheck(hostId: number) {
    const key = this.hostKey(hostId);
    this.versionChecks.delete(key);
    this.failedVersionChecks.delete(key);
  }

  async repairAfterProxyFailure(
    host: HostWithSecret,
    error: unknown,
  ): Promise<RemoteCodexVersionState> {
    if (!isRecoverableCodexInstallError(error)) {
      throw error;
    }

    hostLifecycleBus.emit({
      hostId: host.id,
      status: "upgrading",
      message: `${hostDisplayName(host)} 的远端 Codex app-server 启动失败，正在重新安装 ${SUPPORTED_CODEX_VERSION}：${messageFromError(error)}`,
    });

    return await this.upgradeWorkflow.ensure(host, true);
  }

  private hostKey(hostId: number) {
    return `${currentGatewayUserId() ?? "anonymous"}:${hostId}`;
  }
}

const VERSION_CHECK_FAILURE_COOLDOWN_MS = 30_000;

function hostDisplayName(host: HostWithSecret) {
  return host.name || host.sshHost;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
