import type { GatewayEvent } from "~~/shared/types";

export type AppServerEventParams = Record<string, any>;
export type GatewayEventHandler = (
  event: GatewayEvent,
  params: AppServerEventParams,
  threadId: string,
) => void;
export type GatewayEventHandlerRegistry = Record<string, GatewayEventHandler>;
