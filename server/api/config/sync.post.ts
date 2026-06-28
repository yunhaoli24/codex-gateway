import { readValidatedBody } from "h3";
import { runtimeState } from "../../utils/gateway/runtime-state";
import { hostManager } from "../../utils/gateway/ssh";
import { gatewayConfigSchema } from "../../utils/gateway/validation";

export default defineEventHandler(async (event) => {
  const config = await readValidatedBody(event, (body) => gatewayConfigSchema.parse(body));
  runtimeState.replaceConfig(config);
  hostManager.syncHosts(runtimeState.listHostsWithSecret());
  return runtimeState.exportConfig();
});
