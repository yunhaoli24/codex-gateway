import { getRouterParam } from "h3";
import { defineGatewayConfigMutationHandler } from "../../utils/gateway/http/config-mutation";
import { saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { projectStore } from "../../utils/gateway/state/projects";

export default defineGatewayConfigMutationHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  requireRecord(projectStore.delete(id), "Project not found");
  saveCurrentUserConfig(event);
  return { ok: true };
});
