import type { HostRuntimeSlot } from "../runtime/host-runtime-slot";
import { runWithGatewayUser } from "../state/memory";
import { refreshRunningThreadsForHost } from "../runtime/running-thread-sync";
import { activeMainThreadMonitor } from "../runtime/active-main-thread-monitor";
import { runtimeLog } from "../runtime/runtime-log";

export class StaleRunningThreadScanner {
  private running = false;

  async run(slots: HostRuntimeSlot[]) {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      for (const slot of slots) {
        await runWithGatewayUser(slot.userId, async () => {
          try {
            await activeMainThreadMonitor.refreshHost(slot.host);
          } catch (error) {
            // Discovery is additive. A temporarily unavailable Host must not keep
            // later Hosts from refreshing their existing running-thread snapshots.
            runtimeLog("active main thread scan failed", {
              hostId: slot.host.id,
              hostName: slot.host.name,
              message: error instanceof Error ? error.message : String(error),
            });
          }
          await refreshRunningThreadsForHost({
            host: slot.host,
            reason: "stale-scan",
            staleOnly: true,
          });
        });
      }
    } finally {
      this.running = false;
    }
  }
}
