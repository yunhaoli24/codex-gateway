import { readValidatedBody } from "h3";
import { hostCreateSchema } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => hostCreateSchema.parse(body));
  return hostStore.create(input);
});
