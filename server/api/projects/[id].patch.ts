import { getRouterParam, readValidatedBody } from "h3";
import { defineGatewayConfigMutationHandler } from "../../utils/gateway/http/config-mutation";
import { saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { projectUpdateSchema } from "../../utils/gateway/http/validation/hosts-projects";
import { hostStore } from "../../utils/gateway/state/hosts";
import { projectStore } from "../../utils/gateway/state/projects";

export default defineGatewayConfigMutationHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const input = await readValidatedBody(event, (body) => projectUpdateSchema.parse(body));
  requireRecord(hostStore.get(input.hostId), "Host not found");
  const project = requireRecord(projectStore.update(id, input), "Project not found");
  saveCurrentUserConfig(event);
  return project;
});
