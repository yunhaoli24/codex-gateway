import { getQuery } from "h3";
import { projectStore } from "../../utils/gateway/state/projects";

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const hostId = query.hostId ? Number(query.hostId) : undefined;
  return projectStore.list(hostId);
});
