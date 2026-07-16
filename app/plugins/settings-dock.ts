import SettingsDockAppearancePanel from "@/components/settings/settings-dock/SettingsDockAppearancePanel.vue";
import SettingsDockConfigPanel from "@/components/settings/settings-dock/SettingsDockConfigPanel.vue";
import SettingsDockHostPanel from "@/components/settings/settings-dock/SettingsDockHostPanel.vue";
import SettingsDockNotificationPanel from "@/components/settings/settings-dock/SettingsDockNotificationPanel.vue";
import SettingsDockTab from "@/components/settings/settings-dock/SettingsDockTab.vue";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component("SettingsDockAppearancePanel", SettingsDockAppearancePanel);
  nuxtApp.vueApp.component("SettingsDockConfigPanel", SettingsDockConfigPanel);
  nuxtApp.vueApp.component("SettingsDockHostPanel", SettingsDockHostPanel);
  nuxtApp.vueApp.component("SettingsDockNotificationPanel", SettingsDockNotificationPanel);
  nuxtApp.vueApp.component("SettingsDockTab", SettingsDockTab);
});
