<script setup lang="ts">
import { StarIcon } from "@lucide/vue";
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
import { selectedRowClass } from "./sidebar-utils";
import SidebarRowLabel from "./SidebarRowLabel.vue";
import ThreadStatusIndicator from "./ThreadStatusIndicator.vue";

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
        class="h-auto min-h-9 w-full min-w-0 justify-start overflow-hidden rounded-lg px-3 py-2 text-sm font-normal hover:bg-surface"
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
          <template #trailing>
            <ThreadStatusIndicator :status="status" :completion-attention="completionAttention" />
          </template>
        </SidebarRowLabel>
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
