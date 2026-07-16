import type {
  ContextMenuItem,
  DockviewApi,
  DockviewGroupPanel,
  DockviewPanelApi,
  IDockviewPanel,
} from "dockview-vue";
import { toast } from "vue-sonner";
import type { WorkspaceDockPanelParams } from "./types";
import { workspacePanelPolicy } from "./panel-registry";

export function floatDockItem(api: DockviewApi, item: IDockviewPanel | DockviewGroupPanel) {
  api.addFloatingGroup(item, floatingBounds());
}

export function splitDockPanelRight(api: DockviewPanelApi) {
  api.moveTo({ group: api.group, position: "right" });
}

export async function popoutDockItem(
  api: DockviewApi,
  item: IDockviewPanel | DockviewGroupPanel,
  blockedMessage: { title: string; description: string },
) {
  const opened = await api.addPopoutGroup(item, { popoutUrl: "/popout.html" });
  if (!opened) notifyPopoutBlocked(blockedMessage);
}

export function notifyPopoutBlocked(message: { title: string; description: string }) {
  toast.error(message.title, { description: message.description });
}

export function createDockTabMenu(options: {
  api: DockviewApi;
  panel: IDockviewPanel;
  labels: {
    splitRight: string;
    maximize: string;
    float: string;
    popout: string;
    close: string;
    popupBlocked: string;
    popupBlockedDescription: string;
  };
  closeDynamic: (panel: IDockviewPanel) => void;
}): ContextMenuItem[] {
  const { api, panel, labels } = options;
  const items: ContextMenuItem[] = [
    { label: labels.splitRight, action: () => splitDockPanelRight(panel.api) },
    { label: labels.maximize, action: () => panel.api.maximize() },
    { label: labels.float, action: () => floatDockItem(api, panel) },
    {
      label: labels.popout,
      action: () =>
        void popoutDockItem(api, panel, {
          title: labels.popupBlocked,
          description: labels.popupBlockedDescription,
        }),
    },
  ];
  const kind = (panel.params as WorkspaceDockPanelParams).kind;
  if (workspacePanelPolicy(kind).closable) {
    items.push("separator", { label: labels.close, action: () => options.closeDynamic(panel) });
  }
  return items;
}

function floatingBounds() {
  return {
    width: Math.min(window.innerWidth * 0.72, 880),
    height: Math.min(window.innerHeight * 0.72, 640),
    x: window.innerWidth * 0.08,
    y: window.innerHeight * 0.08,
  };
}
