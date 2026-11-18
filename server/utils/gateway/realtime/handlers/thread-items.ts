import type { RealtimeClientMessage } from "~~/shared/types";
import { threadItemsListResponseSchema } from "~~/shared/runtime/app-server";
import { commandOutputWindow } from "~~/shared/thread-history/retention";
import { requireRecord } from "../../http/validation/common";
import { threadBroker } from "../../runtime/broker";
import { hostStore } from "../../state/hosts";
import { sendRealtimePeerMessage, type RealtimePeer } from "../peer-state";

export async function listThreadItems(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "thread.items.list" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  const client = await threadBroker.getHostClient(host);
  // Only single-Turn disclosure uses output deferral. Timeline order and history pagination
  // remain authoritative in thread/timeline/list, whose protocol has no deferOutput option.
  const result = await client.request(
    "thread/items/list",
    {
      threadId: request.threadId,
      turnId: request.turnId,
      cursor: request.cursor,
      limit: request.limit ?? 50,
      sortDirection: "asc",
      deferOutput: { commandExecution: true, mcpToolCall: true },
    },
    120_000,
    (value) => threadItemsListResponseSchema.parse(value),
  );
  sendRealtimePeerMessage(peer, {
    type: "thread.items.page",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    ...result,
    data: result.data.map((entry) => ({ ...entry, item: commandOutputWindow(entry.item) })),
  });
}

export async function readThreadItems(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "thread.items.read" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  const response = await threadBroker.readThreadItems(
    host,
    request.threadId,
    request.turnId,
    request.itemIds,
  );
  sendRealtimePeerMessage(peer, {
    type: "thread.items.result",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    ...response,
    // Fetch one authoritative item on SSH, but send only the requested command-output window
    // to the browser. Sending full output first would defeat the client memory retention limit.
    data: response.data.map((entry) => ({
      ...entry,
      item: commandOutputWindow(entry.item, request.outputEnd),
    })),
  });
}
