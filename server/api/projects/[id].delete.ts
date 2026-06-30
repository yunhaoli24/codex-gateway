import { getRouterParam } from "h3";
import { defineGatewayEventHandler, saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation";
import { projectStore } from "../../utils/gateway/state/projects";

export default defineGatewayEventHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  requireRecord(projectStore.delete(id), "Project not found");
  saveCurrentUserConfig(event);
  return { ok: true };
});
