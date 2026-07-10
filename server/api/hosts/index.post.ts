import { readValidatedBody } from "h3";
import { defineGatewayConfigMutationHandler } from "../../utils/gateway/http/config-mutation";
import { saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { hostCreateSchema } from "../../utils/gateway/http/validation/hosts-projects";
import { hostRuntimeSupervisor } from "../../utils/gateway/runtime/host-runtime-supervisor";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayConfigMutationHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => hostCreateSchema.parse(body));
  const host = hostStore.create(input);
  hostRuntimeSupervisor.syncCurrentUserConfig();
  saveCurrentUserConfig(event);
  return host;
});
