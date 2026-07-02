import type { RealtimeClientMessage } from "~~/shared/types";
import { respondToServerRequestFromRealtime } from "../server-request-response";
import { interruptTurnFromRealtime } from "../turn-interrupt";
import { startTurnFromRealtime } from "../turn-start";
import { steerTurnFromRealtime } from "../turn-steer";
import { sendRealtimePeerMessage, type RealtimePeer } from "../peer-state";

export async function startTurn(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "turn.start" }>,
) {
  const result = await startTurnFromRealtime(request);
  sendRealtimePeerMessage(peer, {
    type: "turn.start.accepted",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    turn: result?.turn,
  });
}

export async function steerTurn(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "turn.steer" }>,
) {
  const result = await steerTurnFromRealtime(request);
  sendRealtimePeerMessage(peer, {
    type: "turn.steer.accepted",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    turnId: result?.turnId,
  });
}

export async function interruptTurn(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "turn.interrupt" }>,
) {
  await interruptTurnFromRealtime(request);
  sendRealtimePeerMessage(peer, {
    type: "turn.interrupt.accepted",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
  });
}

export async function respondToServerRequest(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "serverRequest.respond" }>,
) {
  await respondToServerRequestFromRealtime(request);
  sendRealtimePeerMessage(peer, {
    type: "serverRequest.respond.accepted",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    serverRequestId: request.serverRequestId,
  });
}

export function ping(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "ping" }>,
) {
  sendRealtimePeerMessage(peer, { type: "pong", nonce: request.nonce });
}
