<script setup lang="ts">
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppearanceSettingsTab from "@/components/settings/AppearanceSettingsTab.vue";
import ConfigSettingsTab from "@/components/settings/ConfigSettingsTab.vue";
import HostSettingsTab from "@/components/settings/HostSettingsTab.vue";
import NotificationSettingsTab from "@/components/settings/NotificationSettingsTab.vue";

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
</script>

<template>
  <Tabs data-testid="settings-panel" default-value="config" class="flex min-h-0 flex-1 flex-col">
    <TabsList class="mb-4">
      <TabsTrigger value="appearance">{{ t("app.appearanceSettings") }}</TabsTrigger>
      <TabsTrigger value="config">{{ t("app.configJson") }}</TabsTrigger>
      <TabsTrigger value="hosts">{{ t("app.hosts") }}</TabsTrigger>
      <TabsTrigger value="notifications">{{ t("app.notificationSettings") }}</TabsTrigger>
    </TabsList>

    <TabsContent value="appearance" class="min-h-0 flex-1 overflow-y-auto">
      <AppearanceSettingsTab />
    </TabsContent>

    <TabsContent value="config" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ConfigSettingsTab @close="emit('close')" />
    </TabsContent>

    <TabsContent value="hosts" class="min-h-0 flex-1 overflow-y-auto">
      <HostSettingsTab @close="emit('close')" />
    </TabsContent>

    <TabsContent value="notifications" class="min-h-0 flex-1 overflow-y-auto">
      <NotificationSettingsTab />
    </TabsContent>
  </Tabs>
</template>
