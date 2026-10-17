import type { RealtimeClientMessage } from "~~/shared/types";
import { commandOutputWindow } from "~~/shared/thread-history/retention";
import { requireRecord } from "../../http/validation/common";
import { threadBroker } from "../../runtime/broker";
import { hostStore } from "../../state/hosts";
import { sendRealtimePeerMessage, type RealtimePeer } from "../peer-state";

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
