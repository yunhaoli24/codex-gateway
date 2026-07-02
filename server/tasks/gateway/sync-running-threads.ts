import { runningThreadStateSyncTask } from "../../utils/gateway/scheduled-tasks/running-thread-state-sync";

export default defineTask({
  meta: {
    name: "gateway:sync-running-threads",
    description: "Refresh stale running Codex threads from app-server state.",
  },
  async run() {
    return runningThreadStateSyncTask.run();
  },
});
