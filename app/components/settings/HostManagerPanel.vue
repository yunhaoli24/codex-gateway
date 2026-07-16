<script setup lang="ts">
import { ServerIcon, Trash2Icon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { hostConnectionClass, hostConnectionLabelKey } from "@/components/sidebar/sidebar-utils";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";

const store = useGatewayStore();
const navigation = useGatewayNavigationStore();
const { hosts, hostConnectionStatuses } = storeToRefs(store);
const { selectedHostId } = storeToRefs(navigation);
const { t } = useI18n();

async function selectHost(hostId: number) {
  await store.selectHost(hostId);
}

async function deleteHost(hostId: number) {
  await store.deleteHost(hostId);
}

function hostConnectionStatus(hostId: number) {
  return hostConnectionStatuses.value[hostId] ?? { status: "idle" as const, message: null };
}

function hostConnectionLabel(hostId: number) {
  const connection = hostConnectionStatus(hostId);
  return (
    connection.message ||
    (connection.status === "idle" ? "" : t(hostConnectionLabelKey(connection.status)))
  );
}

function hostStatusMessage(hostId: number) {
  return hostConnectionLabel(hostId);
}

function hostStatusClass(hostId: number) {
  if (hostConnectionLabel(hostId)) {
    return hostConnectionClass(hostConnectionStatus(hostId).status);
  }
  return "text-destructive";
}
</script>

<template>
  <section class="space-y-2">
    <div class="flex items-center justify-between px-1">
      <div class="text-xs font-medium text-ink-secondary">{{ t("app.hosts") }}</div>
      <Badge variant="secondary">{{ hosts.length }}</Badge>
    </div>

    <ScrollArea class="max-h-56">
      <div class="space-y-1 pr-2">
        <div
          v-for="host in hosts"
          :key="host.id"
          class="rounded-lg p-1"
          :class="host.id === selectedHostId ? 'bg-primary/10' : 'hover:bg-canvas-soft'"
        >
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              class="min-w-0 flex-1 justify-start gap-2 px-2 text-left"
              @click="selectHost(host.id)"
            >
              <ServerIcon class="size-4 shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm">{{ host.name }}</span>
                <span class="block truncate text-[0.6875rem] text-ink-muted">
                  {{ host.sshHost }}
                </span>
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="size-8 p-0 text-destructive hover:text-destructive/80"
              :aria-label="t('app.deleteHost')"
              @click="deleteHost(host.id)"
            >
              <Trash2Icon class="size-4" />
            </Button>
          </div>
          <div
            v-if="hostStatusMessage(host.id)"
            class="whitespace-pre-line px-2 pb-1 text-[0.6875rem]"
            :class="hostStatusClass(host.id)"
          >
            {{ hostStatusMessage(host.id) }}
          </div>
        </div>
      </div>
    </ScrollArea>
  </section>
</template>
