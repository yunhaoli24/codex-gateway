import { hostRuntimeSupervisor } from "../utils/gateway/runtime/host-runtime-supervisor";

export default defineNitroPlugin((nitroApp) => {
  hostRuntimeSupervisor.start();
  nitroApp.hooks.hook("close", () => {
    hostRuntimeSupervisor.stop();
  });
});
