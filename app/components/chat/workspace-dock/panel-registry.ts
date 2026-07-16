import type { Component } from "vue";
import {
  ActivityIcon,
  BotIcon,
  FilesIcon,
  GlobeIcon,
  MonitorIcon,
  TerminalIcon,
} from "@lucide/vue";
import type { WorkspacePanelKind } from "./types";

interface WorkspacePanelPolicy {
  component: string;
  icon: Component;
  closable: boolean;
  dynamic: boolean;
}

export const workspacePanelRegistry = {
  agent: {
    component: "WorkspaceDockAgentPanel",
    icon: MonitorIcon,
    closable: false,
    dynamic: false,
  },
  files: { component: "WorkspaceDockFilesPanel", icon: FilesIcon, closable: false, dynamic: false },
  terminal: {
    component: "WorkspaceDockTerminalPanel",
    icon: TerminalIcon,
    closable: true,
    dynamic: true,
  },
  subagent: {
    component: "WorkspaceDockSubAgentPanel",
    icon: BotIcon,
    closable: true,
    dynamic: true,
  },
  browser: {
    component: "WorkspaceDockBrowserPanel",
    icon: GlobeIcon,
    closable: true,
    dynamic: true,
  },
  tmux: {
    component: "WorkspaceDockTmuxPanel",
    icon: ActivityIcon,
    closable: true,
    dynamic: true,
  },
} satisfies Record<WorkspacePanelKind, WorkspacePanelPolicy>;

export function workspacePanelPolicy(kind: WorkspacePanelKind): WorkspacePanelPolicy {
  return workspacePanelRegistry[kind];
}
