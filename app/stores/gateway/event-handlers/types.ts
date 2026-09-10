import type { GatewayEvent } from "~~/shared/types";
import type { AgentEvent } from "~~/shared/agent/events";

export type GatewayEventHandler = (event: GatewayEvent, threadId: string) => void;
export type GatewayEventHandlerRegistry = Partial<Record<AgentEvent["type"], GatewayEventHandler>>;
