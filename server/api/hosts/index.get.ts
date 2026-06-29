import { hostStore } from "../../utils/gateway/state/hosts";

export default defineEventHandler(() => {
  return hostStore.list();
});
