import { readValidatedBody } from "h3";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { requireRecord, threadRenameSchema } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => threadRenameSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  await threadBroker.renameThread(host, input.threadId, input.name);
  return { ok: true };
});
