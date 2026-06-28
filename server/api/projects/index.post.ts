import { readValidatedBody } from "h3";
import { runtimeState } from "../../utils/gateway/runtime-state";
import { projectCreateSchema, requireRecord } from "../../utils/gateway/validation";

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => projectCreateSchema.parse(body));
  requireRecord(runtimeState.getHost(input.hostId), "Host not found");
  return runtimeState.createProject(input);
});
