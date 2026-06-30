import type { GatewayEvent } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";

export type AppServerEventParams = Record<string, any>;
export interface AppServerEventContext {
  notifyTerminal: boolean;
}

export type GatewayEventHandler = (
  ctx: GatewayStoreContext,
  event: GatewayEvent,
  params: AppServerEventParams,
  threadId: string,
  eventContext: AppServerEventContext,
) => void;

export type GatewayEventHandlerRegistry = Record<string, GatewayEventHandler>;
