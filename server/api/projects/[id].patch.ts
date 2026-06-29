import { getRouterParam, readValidatedBody } from "h3";
import { defineGatewayEventHandler } from "../../utils/gateway/http/errors";
import { projectUpdateSchema, requireRecord } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";
import { projectStore } from "../../utils/gateway/state/projects";

export default defineGatewayEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const input = await readValidatedBody(event, (body) => projectUpdateSchema.parse(body));
  requireRecord(hostStore.get(input.hostId), "Host not found");
  return requireRecord(projectStore.update(id, input), "Project not found");
});
