export type TerminalScope = "host" | "project" | "thread";

export interface TerminalOpenTarget {
  hostId: number;
  projectId?: number | null;
  threadId?: string | null;
  cwd?: string | null;
  title?: string | null;
  scope: TerminalScope;
  cols: number;
  rows: number;
}

export interface TerminalSessionSnapshot {
  sessionId: string;
  hostId: number;
  projectId: number | null;
  threadId: string | null;
  cwd: string | null;
  title: string;
  scope: TerminalScope;
  cols: number;
  rows: number;
  createdAt: string;
  lastActiveAt: string;
  status: "open" | "closed";
  output: string;
}
