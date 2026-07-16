import WorkspaceDockAgentPanel from "@/components/chat/workspace-dock/WorkspaceDockAgentPanel.vue";
import WorkspaceDockFilesPanel from "@/components/chat/workspace-dock/WorkspaceDockFilesPanel.vue";
import WorkspaceDockBrowserPanel from "@/components/chat/workspace-dock/WorkspaceDockBrowserPanel.vue";
import WorkspaceDockGroupActions from "@/components/chat/workspace-dock/WorkspaceDockGroupActions.vue";
import WorkspaceDockSubAgentPanel from "@/components/chat/workspace-dock/WorkspaceDockSubAgentPanel.vue";
import WorkspaceDockTab from "@/components/chat/workspace-dock/WorkspaceDockTab.vue";
import WorkspaceDockTerminalPanel from "@/components/chat/workspace-dock/WorkspaceDockTerminalPanel.vue";
import WorkspaceDockTmuxPanel from "@/components/chat/workspace-dock/WorkspaceDockTmuxPanel.vue";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component("WorkspaceDockAgentPanel", WorkspaceDockAgentPanel);
  nuxtApp.vueApp.component("WorkspaceDockFilesPanel", WorkspaceDockFilesPanel);
  nuxtApp.vueApp.component("WorkspaceDockBrowserPanel", WorkspaceDockBrowserPanel);
  nuxtApp.vueApp.component("WorkspaceDockGroupActions", WorkspaceDockGroupActions);
  nuxtApp.vueApp.component("WorkspaceDockSubAgentPanel", WorkspaceDockSubAgentPanel);
  nuxtApp.vueApp.component("WorkspaceDockTab", WorkspaceDockTab);
  nuxtApp.vueApp.component("WorkspaceDockTerminalPanel", WorkspaceDockTerminalPanel);
  nuxtApp.vueApp.component("WorkspaceDockTmuxPanel", WorkspaceDockTmuxPanel);
});
