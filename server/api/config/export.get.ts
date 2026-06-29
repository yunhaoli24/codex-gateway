import { runtimeConfigStore } from "../../utils/gateway/state/runtime-config";

export default defineEventHandler(() => {
  return runtimeConfigStore.export();
});
