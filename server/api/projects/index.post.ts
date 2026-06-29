import { readValidatedBody } from "h3";
import { projectCreateSchema, requireRecord } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";
import { projectStore } from "../../utils/gateway/state/projects";

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => projectCreateSchema.parse(body));
  requireRecord(hostStore.get(input.hostId), "Host not found");
  return projectStore.create(input);
});
