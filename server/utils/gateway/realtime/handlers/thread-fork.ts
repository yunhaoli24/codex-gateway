import { z } from "zod";
import type { RealtimeClientMessage } from "~~/shared/types";
import { appServerThreadSchema } from "~~/shared/runtime/app-server";
import { requireRecord } from "../../http/validation/common";
import { hostStore } from "../../state/hosts";
import { threadBroker } from "../../runtime/broker";
import { sendRealtimePeerMessage, type RealtimePeer } from "../peer-state";

export async function forkThread(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "thread.fork" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  const client = await threadBroker.getHostClient(host);
  const result = await client.request(
    "thread/fork",
    {
      threadId: request.threadId,
      ...(request.boundary === "before"
        ? { beforeTurnId: request.turnId }
        : { lastTurnId: request.turnId }),
      excludeTurns: true,
      // Forking a goal thread must not silently start work before the user sends their first input.
      deferGoalContinuation: true,
    },
    120_000,
    (value) => z.object({ thread: appServerThreadSchema }).loose().parse(value),
  );
  // Fork subscribes the caller automatically. Release that unowned subscription before returning
  // its ID: the ordinary browser activation then acquires the managed lease. If the page closes
  // meanwhile, an unused fork cannot retain an App Server runtime indefinitely.
  await client.request("thread/unsubscribe", { threadId: result.thread.id });
  sendRealtimePeerMessage(peer, {
    type: "thread.forked",
    requestId: request.requestId,
    hostId: request.hostId,
    thread: result.thread,
  });
}
