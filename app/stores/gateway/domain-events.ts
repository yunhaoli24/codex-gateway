import type { ThreadSettingsState, ThreadTokenUsageState } from "~~/shared/types";
import type { ThreadRuntimeStatus } from "./types";
import { EventEmitter } from "@posva/event-emitter";

export type GatewayDomainEventMap = {
  "thread-summary-detected": {
    hostId: number;
    thread: any;
  };
  "thread-status-detected": {
    hostId: number;
    threadId: string;
    status: ThreadRuntimeStatus;
    turnId?: string | null;
  };
  "terminal-process-detected": {
    hostId: number;
    threadId: string;
    turnId: string;
    itemId: string;
    processId: string;
  };
  "terminal-process-completed": {
    hostId: number;
    threadId: string;
    turnId: string;
    itemId: string;
  };
  "remote-files-changed": {
    hostId: number;
    threadId: string;
    paths: string[];
  };
  "thread-settings-detected": {
    hostId: number;
    threadId: string;
    settings: ThreadSettingsState;
  };
  "thread-token-usage-detected": {
    hostId: number;
    threadId: string;
    tokenUsage: ThreadTokenUsageState;
  };
  "history-item-upsert": { hostId: number; threadId: string; item: any };
  "history-agent-delta": { hostId: number; threadId: string; params: any };
  "history-plan-delta": { hostId: number; threadId: string; params: any };
  "history-reasoning-summary-delta": { hostId: number; threadId: string; params: any };
  "history-reasoning-text-delta": { hostId: number; threadId: string; params: any };
  "history-item-output-delta": {
    hostId: number;
    threadId: string;
    params: any;
    itemType: "commandExecution" | "fileChange";
  };
  "history-server-request-resolved": {
    hostId: number;
    threadId: string;
    requestId: string | number;
  };
  "history-turn-diff-updated": { hostId: number; threadId: string; params: any };
  "history-turn-appended": { hostId: number; threadId: string; turn: any };
  "history-turn-synced": { hostId: number; threadId: string; turn: any };
};

export const gatewayDomainEvents = new EventEmitter<GatewayDomainEventMap>();
