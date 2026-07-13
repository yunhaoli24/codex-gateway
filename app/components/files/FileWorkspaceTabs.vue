<script setup lang="ts">
import { FileTextIcon, XIcon } from "@lucide/vue";
import type { FilePreviewDocument } from "~~/shared/types";

defineProps<{
  documents: FilePreviewDocument[];
  activePath: string | null;
}>();

const emit = defineEmits<{
  activate: [path: string];
  close: [path: string];
}>();
</script>

<template>
  <div
    class="flex h-10 min-w-0 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-hairline bg-canvas-soft/60"
    role="tablist"
    :aria-label="$t('app.openFileTabs')"
  >
    <button
      v-for="document in documents"
      :key="document.key"
      type="button"
      data-testid="file-workspace-tab"
      :data-file-path="document.path"
      role="tab"
      :aria-selected="document.path === activePath"
      class="group flex w-52 min-w-0 max-w-[min(14rem,46vw)] shrink-0 items-center gap-2 overflow-hidden border-r border-hairline px-3 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
      :class="document.path === activePath ? 'bg-surface text-ink shadow-sm' : ''"
      :title="document.path"
      @click="emit('activate', document.path)"
    >
      <FileTextIcon class="size-3.5 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ document.title }}</span>
      <span
        v-if="document.saving"
        class="size-3 shrink-0 animate-spin rounded-full border border-primary border-t-transparent"
        :aria-label="$t('app.savingFile')"
      />
      <span v-else-if="document.conflict" class="size-2 shrink-0 rounded-full bg-destructive" />
      <span v-else-if="document.dirty" class="size-2 shrink-0 rounded-full bg-accent-orange" />
      <span
        v-else-if="document.stale"
        class="size-1.5 shrink-0 rounded-full bg-primary"
        :aria-label="$t('app.remoteFileChanged')"
      />
      <span
        role="button"
        tabindex="0"
        class="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-canvas-soft hover:text-ink"
        :aria-label="$t('app.closeTab')"
        @click.stop="emit('close', document.path)"
        @keydown.enter.space.prevent.stop="emit('close', document.path)"
      >
        <XIcon class="size-3" />
      </span>
    </button>
  </div>
</template>
