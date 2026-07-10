import { userStore } from "../auth/users";

export const expiredSessionCleanupTask = {
  run() {
    return { deleted: userStore.deleteExpiredSessions() };
  },
};
