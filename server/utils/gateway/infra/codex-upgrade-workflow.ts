import { SUPPORTED_CODEX_VERSION, isCodexVersionAtLeast } from "./codex-version";
import { hostLifecycleBus } from "../state/host-events";
import type { HostWithSecret, RemoteCodexVersionState } from "./ssh-types";
import type { AppServerRuntimeProbe } from "./app-server-runtime-probe";
import type { CodexUpgrader } from "./codex-upgrader";
import { CodexUpgradeQueue } from "./codex-upgrade-queue";
import type { CodexVersionChecker } from "./codex-version-checker";

export class CodexUpgradeWorkflow {
  private readonly queue = new CodexUpgradeQueue();

  constructor(
    private readonly runtime: AppServerRuntimeProbe,
    private readonly upgrader: CodexUpgrader,
    private readonly versionChecker: CodexVersionChecker,
  ) {}

  async repair(host: HostWithSecret): Promise<RemoteCodexVersionState> {
    return await this.runExclusive(host, async () => {
      const beforeVersion = await this.readVersionForRepair(host);
      await this.stopRuntimeIfPresent(host);
      const version = await this.upgrader.upgrade(host, SUPPORTED_CODEX_VERSION);
      await this.runtime.ensureStoppedAfterUpgrade(host);

      return {
        version,
        appServerVersion: null,
        supportedVersion: SUPPORTED_CODEX_VERSION,
        beforeVersion,
        upgraded: true,
      };
    });
  }

  async upgradeOutdatedCli(
    host: HostWithSecret,
    supportedVersion: string,
    observedBeforeVersion: string,
  ): Promise<RemoteCodexVersionState> {
    return await this.runExclusive(host, async () => {
      // Hosts can wait in this queue for several minutes. Re-read both CLI and app-server state
      // when this Host reaches the front so a newly started thread is never interrupted and an
      // externally completed upgrade is not repeated.
      const beforeVersion = await this.versionChecker.readVersionOrRecoverableMissing(host);
      const runtimeState = await this.runtime.readState(host);
      const currentRuntimeVersion = runtimeState.appServerVersion ?? beforeVersion;
      const cliVersionSupported = isCodexVersionAtLeast(beforeVersion, supportedVersion);
      const runtimeVersionSupported = isCodexVersionAtLeast(
        currentRuntimeVersion,
        supportedVersion,
      );

      if (runtimeState.running && !runtimeVersionSupported) {
        if (await this.runtime.hasActiveLoadedThread(host)) {
          throw new Error(
            `Remote Codex runtime ${currentRuntimeVersion} is below supported ${supportedVersion}, but a loaded thread is active`,
          );
        }
      }

      if (cliVersionSupported) {
        if (runtimeState.running && !runtimeVersionSupported) {
          await this.runtime.terminateUnmanaged(host);
        }
        hostLifecycleBus.emit({
          hostId: host.id,
          status: runtimeVersionSupported ? "connecting" : "restarting",
          message: runtimeVersionSupported
            ? `${hostDisplayName(host)} 的远端 Codex 已是最新版本 ${beforeVersion}`
            : `${hostDisplayName(host)} 的远端 Codex CLI 已是 ${beforeVersion}，正在重启旧 app-server ${currentRuntimeVersion}`,
        });
        return {
          version: beforeVersion,
          appServerVersion: runtimeVersionSupported ? runtimeState.appServerVersion : null,
          supportedVersion,
          beforeVersion: observedBeforeVersion,
          upgraded: false,
        };
      }

      const version = await this.install(host, supportedVersion, beforeVersion);
      return {
        version,
        appServerVersion: null,
        supportedVersion,
        beforeVersion,
        upgraded: true,
      };
    });
  }

  private async install(host: HostWithSecret, supportedVersion: string, beforeVersion: string) {
    hostLifecycleBus.emit({
      hostId: host.id,
      status: "upgrading",
      message: `正在为 ${hostDisplayName(host)} 准备 Codex ${supportedVersion} 官方 npm 安装包`,
    });
    const version = await this.upgrader.withPreparedUpgrade(
      host,
      supportedVersion,
      async (install) => {
        const latestRuntimeState = await this.runtime.readState(host);
        if (latestRuntimeState.running) {
          if (await this.runtime.hasActiveLoadedThread(host)) {
            throw new Error(
              `Remote Codex runtime is below supported ${supportedVersion}, but a loaded thread became active while waiting to upgrade`,
            );
          }
          await this.runtime.terminateUnmanaged(host);
        }
        hostLifecycleBus.emit({
          hostId: host.id,
          status: "upgrading",
          message: `正在离线升级 ${hostDisplayName(host)} 的远端 Codex ${beforeVersion} -> ${supportedVersion}`,
        });
        return await install();
      },
    );
    await this.runtime.ensureStoppedAfterUpgrade(host);
    if (!isCodexVersionAtLeast(version, supportedVersion)) {
      throw new Error(
        `Remote Codex upgraded to ${version}, still below supported ${supportedVersion}`,
      );
    }
    hostLifecycleBus.emit({
      hostId: host.id,
      status: "restarting",
      message: `${hostDisplayName(host)} 的远端 Codex 已升级到 ${version}，正在重启 app-server`,
    });
    return version;
  }

  private async runExclusive<T>(host: HostWithSecret, work: () => Promise<T>) {
    if (this.queue.busy) {
      hostLifecycleBus.emit({
        hostId: host.id,
        status: "upgrading",
        message: `${hostDisplayName(host)} 正在等待 Codex 升级队列`,
      });
    }
    return await this.queue.run(work);
  }

  private async readVersionForRepair(host: HostWithSecret) {
    try {
      return await this.versionChecker.readVersionOrRecoverableMissing(host);
    } catch {
      return "0.0.0";
    }
  }

  private async stopRuntimeIfPresent(host: HostWithSecret) {
    const runtimeState = await this.runtime.readState(host);
    if (runtimeState.running) await this.runtime.terminateUnmanaged(host);
  }
}

function hostDisplayName(host: HostWithSecret) {
  return host.name || host.sshHost;
}
