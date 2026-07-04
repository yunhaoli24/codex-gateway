import { EventEmitter } from "@posva/event-emitter";
import type { GatewayEvent } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";
import type { AppServerEventParams, GatewayEventHandlerRegistry } from "./types";

export interface AppServerEventHandlerPayload {
  ctx: GatewayStoreContext;
  event: GatewayEvent;
  params: AppServerEventParams;
  threadId: string;
}

type AppServerEventEnvelope = AppServerEventHandlerPayload & {
  handled: boolean;
};

type AppServerEventHandlerMap = Record<string, AppServerEventEnvelope>;

export class AppServerEventDispatcher {
  private readonly emitter = new EventEmitter<AppServerEventHandlerMap>();

  constructor(registry: GatewayEventHandlerRegistry) {
    Object.entries(registry).forEach(([method, handler]) => {
      this.emitter.on(method, (payload) => {
        payload.handled = true;
        handler(payload.ctx, payload.event, payload.params, payload.threadId);
      });
    });
  }

  dispatch(method: string, payload: AppServerEventHandlerPayload) {
    const envelope: AppServerEventEnvelope = { ...payload, handled: false };
    this.emitter.emit(method, envelope);
    return envelope.handled;
  }
}
