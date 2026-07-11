import WorkspaceDockAgentPanel from "@/components/chat/WorkspaceDockAgentPanel.vue";
import WorkspaceDockFilesPanel from "@/components/chat/WorkspaceDockFilesPanel.vue";
import WorkspaceDockGroupActions from "@/components/chat/WorkspaceDockGroupActions.vue";
import WorkspaceDockSubAgentPanel from "@/components/chat/WorkspaceDockSubAgentPanel.vue";
import WorkspaceDockTab from "@/components/chat/WorkspaceDockTab.vue";
import WorkspaceDockTerminalPanel from "@/components/chat/WorkspaceDockTerminalPanel.vue";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component("WorkspaceDockAgentPanel", WorkspaceDockAgentPanel);
  nuxtApp.vueApp.component("WorkspaceDockFilesPanel", WorkspaceDockFilesPanel);
  nuxtApp.vueApp.component("WorkspaceDockGroupActions", WorkspaceDockGroupActions);
  nuxtApp.vueApp.component("WorkspaceDockSubAgentPanel", WorkspaceDockSubAgentPanel);
  nuxtApp.vueApp.component("WorkspaceDockTab", WorkspaceDockTab);
  nuxtApp.vueApp.component("WorkspaceDockTerminalPanel", WorkspaceDockTerminalPanel);
});
