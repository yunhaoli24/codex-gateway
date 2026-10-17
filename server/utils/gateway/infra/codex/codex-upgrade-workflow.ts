import { SUPPORTED_CODEX_VERSION, isCodexVersionAtLeast } from "./codex-version";
import { hostLifecycleBus } from "../../state/host-events";
import type { HostWithSecret, RemoteCodexVersionState } from "../ssh/ssh-types";
import type { CodexDaemon } from "./codex-daemon";
import type { CodexUpgrader } from "./codex-upgrader";
import { CodexUpgradeCoordinator } from "./codex-upgrade-queue";
import type { CodexVersionChecker } from "./codex-version-checker";
import { codexUpgradeLog } from "./codex-upgrade-log";
import { hostUpgradeState } from "../../state/host-upgrades";

export class CodexUpgradeWorkflow {
  private readonly coordinator = new CodexUpgradeCoordinator();

  constructor(
    private readonly daemon: CodexDaemon,
    private readonly upgrader: CodexUpgrader,
    private readonly versionChecker: CodexVersionChecker,
  ) {}

  async ensure(host: HostWithSecret, repair = false): Promise<RemoteCodexVersionState> {
    // Re-read after the physical-target lock: different Gateway users can reference the same
    // remote account. Only the first needs to upload; subsequent aliases reuse the selected daemon.
    return await this.coordinator.run(host, async (attempt) => {
      const resources = this.upgrader.createResources(host);
      let installationCompleted = false;
      try {
        const installed = await this.versionChecker.readVersionOrRecoverableMissing(host);
        const beforeVersion = installed.version;
        const installRequired =
          repair ||
          installed.installationLayout !== "standalone" ||
          !isCodexVersionAtLeast(beforeVersion, SUPPORTED_CODEX_VERSION);
        let version = beforeVersion;
        codexUpgradeLog("remote version inspected", host, {
          observedVersion: beforeVersion,
          installationLayout: installed.installationLayout,
          targetVersion: SUPPORTED_CODEX_VERSION,
        });
        if (installRequired) {
          hostUpgradeState.begin(host, SUPPORTED_CODEX_VERSION);
          hostLifecycleBus.emit({
            hostId: host.id,
            status: "upgrading",
            message: `正在离线安装 ${host.name} 的 Codex ${SUPPORTED_CODEX_VERSION}`,
          });
          // Keep the old daemon running during download/SFTP/extraction. Gateway supplies an
          // offline CLI package because remote hosts may have no Internet; only the official
          // daemon update below may replace/drain the running server.
          version = await this.upgrader.upgrade(host, SUPPORTED_CODEX_VERSION, resources, attempt);
          if (!isCodexVersionAtLeast(version, SUPPORTED_CODEX_VERSION)) {
            throw new Error(`Remote Codex upgraded to unsupported version ${version}`);
          }
          installationCompleted = true;
          hostUpgradeState.update(host, { phase: "restarting" });
        }

        const daemon = await this.daemon.ensureVersion(host, version, () => {
          if (!installRequired) hostUpgradeState.begin(host, version);
          hostUpgradeState.update(host, { phase: "restarting" });
          hostLifecycleBus.emit({
            hostId: host.id,
            status: "restarting",
            message: `正在通过官方升级流程更新 ${host.name} 的 Codex daemon 至 ${version}`,
          });
          codexUpgradeLog("official daemon update started", host, { targetVersion: version });
        });
        codexUpgradeLog("daemon ready", host, {
          appServerVersion: daemon.version,
          updated: daemon.updated,
        });
        hostUpgradeState.finish(host, false);
        return {
          version,
          installationLayout: "standalone",
          appServerVersion: daemon.version,
          supportedVersion: SUPPORTED_CODEX_VERSION,
          beforeVersion,
          upgraded: installRequired || daemon.updated,
        };
      } catch (error) {
        hostUpgradeState.finish(host, true);
        throw error;
      } finally {
        await resources.dispose(installationCompleted);
      }
    });
  }
}
