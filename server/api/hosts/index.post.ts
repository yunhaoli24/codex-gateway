import { readValidatedBody } from "h3";
import { defineGatewayEventHandler, saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { hostCreateSchema } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => hostCreateSchema.parse(body));
  const host = hostStore.create(input);
  saveCurrentUserConfig(event);
  return host;
});
