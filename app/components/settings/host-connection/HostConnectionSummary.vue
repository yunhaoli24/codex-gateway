<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2Icon, CircleIcon, LoaderCircleIcon, AlertCircleIcon } from "@lucide/vue";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import HostUpgradeProgress from "./HostUpgradeProgress.vue";
import {
  hostConnectionClass,
  hostConnectionIsBusy,
  hostConnectionLabelKey,
} from "@/components/sidebar/sidebar-utils";

const props = defineProps<{ hostId: number }>();
const catalog = useGatewayCatalogStore();
const { t } = useI18n();
// The sidebar and management share lifecycle state. Upload counters are the server's existing
// log snapshot, refreshed over the same WS by the visible management page.
const connection = computed(() => catalog.localizedHostConnectionStatuses[props.hostId]);
const progress = computed(() => connection.value?.upgradeProgress);
const status = computed(() =>
  progress.value != null
    ? progress.value.phase === "restarting"
      ? "restarting"
      : "upgrading"
    : (connection.value?.status ?? "idle"),
);
const icon = computed(() => {
  if (hostConnectionIsBusy(status.value)) return LoaderCircleIcon;
  if (status.value === "connected") return CheckCircle2Icon;
  if (status.value === "failed" || status.value === "mfaRequired") return AlertCircleIcon;
  return CircleIcon;
});
</script>

<template>
  <div :data-testid="`host-management-status-${hostId}`" :data-status="status" class="space-y-1">
    <div class="flex items-center gap-1.5 text-xs font-medium" :class="hostConnectionClass(status)">
      <component
        :is="icon"
        class="size-3.5 shrink-0"
        :class="{ 'animate-spin': hostConnectionIsBusy(status) }"
      />
      {{ t(hostConnectionLabelKey(status)) }}
    </div>
    <HostUpgradeProgress v-if="progress" :progress="progress" />
    <p v-else-if="connection?.message" class="break-words text-xs text-ink-secondary">
      {{ connection.message }}
    </p>
  </div>
</template>
