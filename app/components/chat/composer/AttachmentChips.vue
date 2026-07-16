<script setup lang="ts">
import { FileIcon, ImageIcon, XIcon } from "@lucide/vue";
import type { ComposerAttachment } from "@/composables/composer/useComposerDraft";
import { Badge } from "@/components/ui/badge";

defineProps<{
  files: ComposerAttachment[];
}>();

const emit = defineEmits<{
  remove: [id: string];
}>();
</script>

<template>
  <div v-if="files.length" class="mb-2 flex flex-wrap gap-2">
    <Badge
      v-for="file in files"
      :key="file.id"
      variant="outline"
      class="h-7 gap-1.5 rounded-md px-2 text-xs"
    >
      <ImageIcon v-if="file.isImage" class="size-3.5 text-primary" />
      <FileIcon v-else class="size-3.5 text-ink-muted" />
      <span class="max-w-48 truncate">{{ file.name }}</span>
      <button
        type="button"
        class="ml-1 rounded-sm text-ink-muted hover:text-ink"
        @click="emit('remove', file.id)"
      >
        <XIcon class="size-3.5" />
      </button>
    </Badge>
  </div>
</template>
