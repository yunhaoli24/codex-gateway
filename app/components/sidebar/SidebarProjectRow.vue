<script setup lang="ts">
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderXIcon,
  PlusIcon,
  Trash2Icon,
} from "@lucide/vue";
import type { ProjectRecord } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { selectedRowClass } from "./sidebar-utils";
import SidebarRowLabel from "./SidebarRowLabel.vue";

const props = defineProps<{
  project: ProjectRecord;
  expanded: boolean;
  selected: boolean;
  missing?: boolean;
  longPressHandlers?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  select: [event: MouseEvent];
  edit: [];
  delete: [];
  startThread: [];
}>();

function selectProject(event: MouseEvent) {
  if (!props.missing) {
    emit("select", event);
  }
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <Button
        :data-testid="`project-button-${project.id}`"
        v-bind="longPressHandlers"
        variant="ghost"
        class="h-10 w-full justify-start gap-2 rounded-lg px-3 text-[0.9375rem] font-normal hover:bg-surface"
        :class="[selectedRowClass(selected), missing ? 'text-ink-faint' : '']"
        :data-project-missing="missing ? 'true' : 'false'"
        @click="selectProject"
      >
        <template v-if="!missing">
          <ChevronDownIcon v-if="expanded" class="size-3.5 shrink-0 text-ink-muted" />
          <ChevronRightIcon v-else class="size-3.5 shrink-0 text-ink-muted" />
        </template>
        <span v-else class="w-3.5 shrink-0" />
        <FolderXIcon v-if="missing" class="size-4 shrink-0 text-destructive/70" />
        <FolderIcon v-else class="size-4 shrink-0" />
        <SidebarRowLabel
          :title="project.name"
          :subtitle="missing ? $t('app.projectDirectoryMissing') : undefined"
        />
        <span v-if="!missing" class="ml-auto size-2 shrink-0 rounded-full bg-accent-green" />
      </Button>
    </ContextMenuTrigger>
    <ContextMenuContent :collision-padding="12" prioritize-position class="w-44">
      <ContextMenuItem @select="emit('edit')">
        <FolderOpenIcon class="mr-2 size-4" />
        {{ $t("app.editProject") }}
      </ContextMenuItem>
      <ContextMenuItem v-if="!missing" @select="emit('startThread')">
        <PlusIcon class="mr-2 size-4" />
        {{ $t("app.newThread") }}
      </ContextMenuItem>
      <ContextMenuItem class="text-destructive focus:text-destructive" @select="emit('delete')">
        <Trash2Icon class="mr-2 size-4" />
        {{ $t("app.deleteProject") }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
