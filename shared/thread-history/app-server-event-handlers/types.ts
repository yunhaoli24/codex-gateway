export interface AppServerEventPayload {
  id?: unknown;
  params?: AppServerEventParams;
}

export interface ApplyAppServerEventInput {
  history: unknown;
  currentThread: unknown;
  threadId: string;
  method: string;
  payload?: AppServerEventPayload | null;
  createdAt?: string | null;
}

export type AppServerEventParams = Record<string, unknown>;
export type AppServerRequestId = string | number | undefined;

export type AppServerHistoryReducer = (
  input: ApplyAppServerEventInput,
  params: AppServerEventParams,
  requestId: AppServerRequestId,
) => unknown;

export type AppServerHistoryReducerRegistry = Record<string, AppServerHistoryReducer>;
