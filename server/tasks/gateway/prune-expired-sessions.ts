import { expiredSessionCleanupTask } from "../../utils/gateway/scheduled-tasks/expired-session-cleanup";

export default defineTask({
  meta: {
    name: "gateway:prune-expired-sessions",
    description: "Delete expired gateway bearer sessions and close their realtime peers.",
  },
  run() {
    return { result: expiredSessionCleanupTask.run() };
  },
});
