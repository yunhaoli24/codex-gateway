import { getQuery } from "h3";
import { defineGatewayEventHandler } from "../../utils/gateway/http/errors";
import { projectStore } from "../../utils/gateway/state/projects";

export default defineGatewayEventHandler((event) => {
  const query = getQuery(event);
  const hostId = query.hostId ? Number(query.hostId) : undefined;
  return projectStore.list(hostId);
});
