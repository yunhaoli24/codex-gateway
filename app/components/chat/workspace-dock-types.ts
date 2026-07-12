import type { ComputedRef, Ref } from "vue";
import type { ThreadRuntimeStatus } from "~~/shared/types";
import type { SubAgentPanelState } from "@/stores/gateway/types";

export type WorkspacePanelKind = "agent" | "files" | "terminal" | "subagent" | "browser";

export interface WorkspaceDockPanelParams {
  kind: WorkspacePanelKind;
  sessionId?: string;
  subAgentHostId?: number;
  subAgentThreadId?: string;
  browserPanelId?: string;
}

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
  visibleSubAgentPanels: SubAgentPanelState[];
  canOpenTerminal: boolean;
  selectedThreadViewReady: boolean;
}

export interface WorkspacePanelSelection {
  selectedHostId: Ref<number | null> | ComputedRef<number | null>;
  selectedProjectId: Ref<number | null> | ComputedRef<number | null>;
  selectedThreadId: Ref<string | null> | ComputedRef<string | null>;
  visibleSubAgentPanels: Ref<SubAgentPanelState[]> | ComputedRef<SubAgentPanelState[]>;
}
