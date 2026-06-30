import { readValidatedBody } from "h3";
import { defineGatewayEventHandler, saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { projectCreateSchema, requireRecord } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";
import { projectStore } from "../../utils/gateway/state/projects";

export default defineGatewayEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => projectCreateSchema.parse(body));
  requireRecord(hostStore.get(input.hostId), "Host not found");
  const project = projectStore.create(input);
  saveCurrentUserConfig(event);
  return project;
});
