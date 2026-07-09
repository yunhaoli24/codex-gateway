<script setup lang="ts">
import {
  BellDotIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CirclePauseIcon,
  Loader2Icon,
  StarIcon,
} from "@lucide/vue";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import type { ThreadRuntimeStatus } from "@/stores/gateway";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";
import { selectedRowClass, statusClass, statusLabelKey } from "./sidebar-utils";
import SidebarRowLabel from "./SidebarRowLabel.vue";

const props = defineProps<{
  thread: any;
  testId: string;
  selected: boolean;
  status: ThreadRuntimeStatus;
  completionAttention?: boolean;
  subtitle?: string;
  renameActive?: boolean;
  renameValue?: string;
  pinLabel: string;
  showPinnedIcon?: boolean;
  longPressHandlers?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  open: [];
  togglePin: [];
  rename: [];
  submitRename: [];
  renameKeydown: [event: KeyboardEvent];
  "update:renameValue": [value: string];
}>();

const pressHandlers = computed(() => props.longPressHandlers ?? {});
const { t } = useI18n();

const statusIconByStatus = {
  running: Loader2Icon,
  completedUnviewed: BellDotIcon,
  completed: CheckCircle2Icon,
  failed: CircleAlertIcon,
  interrupted: CirclePauseIcon,
} as const;

const displayStatus = computed(() =>
  props.completionAttention ? "completedUnviewed" : props.status,
);
const statusLabel = computed(() => t(statusLabelKey(displayStatus.value)));
const statusIcon = computed(
  () => statusIconByStatus[displayStatus.value as keyof typeof statusIconByStatus] ?? null,
);
const statusIconClass = computed(() => ({
  "animate-spin": props.status === "running",
}));
</script>

<template>
  <div v-if="renameActive" class="rounded-lg px-3 py-1">
    <Input
      :model-value="renameValue"
      data-testid="rename-thread-input"
      class="h-7 min-w-0 bg-surface/80"
      @update:model-value="emit('update:renameValue', String($event))"
      @keydown="emit('renameKeydown', $event)"
      @keydown.enter.prevent="emit('submitRename')"
      @blur="emit('submitRename')"
    />
  </div>
  <ContextMenu v-else>
    <ContextMenuTrigger as-child>
      <Button
        :data-testid="testId"
        v-bind="pressHandlers"
        :data-selected="selected ? 'true' : 'false'"
        variant="ghost"
        class="h-auto min-h-9 w-full justify-between rounded-lg px-3 py-2 text-sm font-normal hover:bg-surface"
        :class="selectedRowClass(selected)"
        @click="emit('open')"
      >
        <SidebarRowLabel :title="titleForThread(thread)" :subtitle="subtitle">
          <template #title-prefix>
            <StarIcon
              v-if="showPinnedIcon"
              class="size-3.5 shrink-0 fill-current text-accent-orange"
            />
          </template>
        </SidebarRowLabel>
        <span
          class="ml-2 inline-flex size-4 shrink-0 items-center justify-center"
          :class="statusClass(displayStatus)"
          :aria-label="statusLabel"
        >
          <component :is="statusIcon" v-if="statusIcon" class="size-3.5" :class="statusIconClass" />
          <span v-else class="size-2 rounded-full bg-current opacity-50" />
        </span>
      </Button>
    </ContextMenuTrigger>
    <ContextMenuContent :collision-padding="12" prioritize-position class="w-40">
      <ContextMenuItem @select="emit('togglePin')">
        {{ pinLabel }}
      </ContextMenuItem>
      <ContextMenuItem @select="emit('rename')">
        {{ $t("app.renameThread") }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
