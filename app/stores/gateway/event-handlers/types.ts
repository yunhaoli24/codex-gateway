import type { GatewayEvent } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";

export type AppServerEventParams = Record<string, any>;

export type GatewayEventHandler = (
  ctx: GatewayStoreContext,
  event: GatewayEvent,
  params: AppServerEventParams,
  threadId: string,
) => void;

export type GatewayEventHandlerRegistry = Record<string, GatewayEventHandler>;
