import type { ThreadHistoryTurn } from "~~/shared/thread-history/types";

export type Translate = (key: string, values?: Record<string, unknown>) => string;

export const MAX_SERVER_OVERLOADED_RETRIES = 5;

export type TurnRequestResult =
  | { type: "turn.start.accepted"; turn?: ThreadHistoryTurn }
  | { type: "turn.steer.accepted"; turnId?: string };
