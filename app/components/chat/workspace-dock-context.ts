import type { IDockviewPanel } from "dockview-vue";
import type { ComputedRef, InjectionKey, Ref } from "vue";
import type { ThreadRuntimeStatus } from "~~/shared/types";

export interface WorkspaceAgentPanelContext {
  initializing: Ref<boolean>;
  openingThread: Ref<boolean>;
  selectedThreadId: Ref<string | null>;
  selectedThreadStatus: Ref<ThreadRuntimeStatus>;
  selectedProjectId: Ref<number | null>;
  selectedHostId: Ref<number | null>;
  historyTurns: Ref<any[]>;
  loading: Ref<boolean>;
  loadingOlderTurns: Ref<boolean>;
  olderTurnsCursor: Ref<string | null>;
  visibleError: Ref<string | null>;
  followKey: Ref<unknown[]>;
  selectedThreadViewReady: Ref<boolean>;
  loadOlder: () => void;
}

export interface WorkspaceFilesPanelContext {
  layout: Ref<"desktop" | "mobile">;
  selectedThreadId: Ref<string | null>;
  selectedProjectId: Ref<number | null>;
  selectedHostId: Ref<number | null>;
  rootPath: ComputedRef<string>;
}

export interface WorkspaceDockUiContext {
  layout: Ref<"desktop" | "mobile">;
  closePanel: (panel: IDockviewPanel) => void;
}

export const WORKSPACE_AGENT_PANEL_CONTEXT: InjectionKey<WorkspaceAgentPanelContext> = Symbol(
  "workspace-agent-panel-context",
);
export const WORKSPACE_FILES_PANEL_CONTEXT: InjectionKey<WorkspaceFilesPanelContext> = Symbol(
  "workspace-files-panel-context",
);
export const WORKSPACE_DOCK_UI_CONTEXT: InjectionKey<WorkspaceDockUiContext> = Symbol(
  "workspace-dock-ui-context",
);

export function requireWorkspaceAgentPanelContext() {
  return requireContext(WORKSPACE_AGENT_PANEL_CONTEXT, "Workspace agent panel context");
}

export function requireWorkspaceFilesPanelContext() {
  return requireContext(WORKSPACE_FILES_PANEL_CONTEXT, "Workspace files panel context");
}

export function requireWorkspaceDockUiContext() {
  return requireContext(WORKSPACE_DOCK_UI_CONTEXT, "Workspace dock UI context");
}

function requireContext<T>(key: InjectionKey<T>, name: string) {
  const context = inject(key);
  if (!context) throw new Error(`${name} is unavailable`);
  return context;
}
