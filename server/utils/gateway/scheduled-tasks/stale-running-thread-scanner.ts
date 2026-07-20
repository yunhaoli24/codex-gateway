import type { HostRuntimeSlot } from "../runtime/host-runtime-slot";
import { runWithGatewayUser } from "../state/memory";
import { refreshRunningThreadsForHost } from "../runtime/running-thread-sync";

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
