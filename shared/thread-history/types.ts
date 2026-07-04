export type ThreadHistoryStatus = string | { type?: unknown } | null | undefined;

export interface ThreadHistoryItem extends Record<string, unknown> {
  id?: string | number | null;
  clientId?: string | number | null;
  turnId?: string | number | null;
  type?: string | null;
  status?: ThreadHistoryStatus;
}

export interface ThreadHistoryTurn extends Record<string, unknown> {
  id?: string | number | null;
  status?: ThreadHistoryStatus;
  items?: ThreadHistoryItem[];
}

export interface ThreadHistoryState {
  thread: ThreadHistoryTurn & {
    id?: string | number | null;
    turns: ThreadHistoryTurn[];
  };
}

export interface ThreadFileChange extends Record<string, unknown> {
  path?: string | null;
  filePath?: string | null;
  pathAfter?: string | null;
  pathBefore?: string | null;
  diff?: string | null;
  kind?: unknown;
  sequence?: number | null;
}

export interface ThreadServerRequestItem extends ThreadHistoryItem {
  requestId?: string | number | null;
  pendingApproval?: {
    requestId?: string | number | null;
  } | null;
}
