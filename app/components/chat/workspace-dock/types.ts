import type { ComputedRef, Ref } from "vue";

import type { ThreadRuntimeStatus } from "~~/shared/types";

export type WorkspacePanelKind = "agent" | "files" | "terminal" | "subagent" | "browser" | "tmux";

export type WorkspaceDockPanelParams =
  | { kind: "agent" }
  | { kind: "files" }
  | { kind: "terminal"; sessionId: string }
  | { kind: "subagent"; subAgentHostId: number; subAgentThreadId: string }
  | { kind: "browser"; browserPanelId: string }
  | { kind: "tmux" };

export type WorkspaceDockPanelParamsFor<K extends WorkspacePanelKind> = Extract<
  WorkspaceDockPanelParams,
  { kind: K }
>;

export interface WorkspaceDockProps {
  layout: "desktop" | "mobile";
  initializing: boolean;
  openingThread: boolean;
  selectedThreadId: string | null;
  selectedThreadStatus: ThreadRuntimeStatus;
  selectedProjectId: number | null;
  selectedHostId: number | null;
  historyTurns: any[];
  loading: boolean;
  loadingOlderTurns: boolean;
  olderTurnsCursor: string | null;
  visibleError: string | null;
  followKey: unknown[];
  canOpenTerminal: boolean;
  selectedThreadViewReady: boolean;
}

export interface WorkspacePanelSelection {
  selectedHostId: Ref<number | null> | ComputedRef<number | null>;
  selectedProjectId: Ref<number | null> | ComputedRef<number | null>;
  selectedThreadId: Ref<string | null> | ComputedRef<string | null>;
}
