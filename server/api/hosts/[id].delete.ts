import { runtimeState } from "../../utils/gateway/runtime-state";
import { hostManager } from "../../utils/gateway/ssh";

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  runtimeState.deleteHost(id);
  hostManager.syncHosts(runtimeState.listHostsWithSecret());
  return { ok: true };
});
