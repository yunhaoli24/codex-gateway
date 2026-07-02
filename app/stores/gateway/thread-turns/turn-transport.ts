import type { ComposerTurnOptions } from "~~/shared/types";
import { sendRealtimeRequest } from "../realtime/request-response";
import type { GatewayStoreContext } from "../types";

export interface TurnStartRequestInput {
  hostId: number;
  threadId: string;
  text: string;
  clientUserMessageId: string;
  cwd?: string | null;
  options: ComposerTurnOptions;
}

export interface TurnSteerRequestInput {
  hostId: number;
  threadId: string;
  expectedTurnId: string;
  text: string;
  clientUserMessageId: string;
  options: ComposerTurnOptions;
}

export interface TurnInterruptRequestInput {
  hostId: number;
  threadId: string;
  turnId: string;
}

export function requestTurnStart(ctx: GatewayStoreContext, input: TurnStartRequestInput) {
  return sendRealtimeRequest<{ type: "turn.start.accepted"; turn?: any }>(ctx, (requestId) => ({
    type: "turn.start",
    requestId,
    hostId: input.hostId,
    threadId: input.threadId,
    text: input.text,
    clientUserMessageId: input.clientUserMessageId,
    cwd: input.cwd ?? undefined,
    model: input.options.model || undefined,
    effort: input.options.effort || undefined,
    approvalPolicy: input.options.approvalPolicy || undefined,
    collaborationMode: input.options.collaborationMode || undefined,
    images: input.options.images ?? [],
    files: input.options.files ?? [],
  }));
}

export function requestTurnSteer(ctx: GatewayStoreContext, input: TurnSteerRequestInput) {
  return sendRealtimeRequest<{ type: "turn.steer.accepted"; turnId?: string }>(
    ctx,
    (requestId) => ({
      type: "turn.steer",
      requestId,
      hostId: input.hostId,
      threadId: input.threadId,
      expectedTurnId: input.expectedTurnId,
      text: input.text,
      clientUserMessageId: input.clientUserMessageId,
      images: input.options.images ?? [],
    }),
  );
}

export function requestTurnInterrupt(ctx: GatewayStoreContext, input: TurnInterruptRequestInput) {
  return sendRealtimeRequest<{ type: "turn.interrupt.accepted" }>(ctx, (requestId) => ({
    type: "turn.interrupt",
    requestId,
    hostId: input.hostId,
    threadId: input.threadId,
    turnId: input.turnId,
  }));
}

export function startNewTurn(
  ctx: GatewayStoreContext,
  text: string,
  clientUserMessageId: string,
  options: ComposerTurnOptions,
) {
  return requestTurnStart(ctx, {
    hostId: ctx.state.selectedHostId!,
    threadId: ctx.state.selectedThreadId!,
    text,
    clientUserMessageId,
    cwd: ctx.selectedProject?.remotePath ?? null,
    options,
  });
}

export function steerActiveTurn(
  ctx: GatewayStoreContext,
  text: string,
  clientUserMessageId: string,
  expectedTurnId: string,
  options: ComposerTurnOptions,
) {
  return requestTurnSteer(ctx, {
    hostId: ctx.state.selectedHostId!,
    threadId: ctx.state.selectedThreadId!,
    expectedTurnId,
    text,
    clientUserMessageId,
    options,
  });
}

export function interruptActiveTurn(ctx: GatewayStoreContext, turnId: string) {
  return requestTurnInterrupt(ctx, {
    hostId: ctx.state.selectedHostId!,
    threadId: ctx.state.selectedThreadId!,
    turnId,
  });
}
