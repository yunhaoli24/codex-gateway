import { runtimeState } from "../../../utils/gateway/runtime-state";
import { hostManager } from "../../../utils/gateway/ssh";
import { requireRecord } from "../../../utils/gateway/validation";

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const host = requireRecord(runtimeState.getHostWithSecret(id), "Host not found");
  return hostManager.verify(host);
});
