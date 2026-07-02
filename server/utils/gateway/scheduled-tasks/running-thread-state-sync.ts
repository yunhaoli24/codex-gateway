import { hostRuntimeSupervisor } from "../runtime/host-runtime-supervisor";
import { StaleRunningThreadScanner } from "./stale-running-thread-scanner";

class RunningThreadStateSyncTask {
  private readonly scanner = new StaleRunningThreadScanner();

  async run() {
    await this.scanner.run(hostRuntimeSupervisor.refreshableSlots());
    return { ok: true };
  }
}

export const runningThreadStateSyncTask = new RunningThreadStateSyncTask();
