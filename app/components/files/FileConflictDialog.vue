<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { FilePreviewDocument } from "~~/shared/types";
import CodeEditor from "@/components/common/CodeEditor.vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { codeEditorLanguageForPath } from "@/utils/code-editor-extensions";
import { fetchRemoteFile } from "@/utils/remote-file-transport";

const props = defineProps<{ document: FilePreviewDocument | null }>();
const emit = defineEmits<{ close: []; discard: []; overwrite: [] }>();
const remoteText = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const language = computed(() => codeEditorLanguageForPath(props.document?.path ?? ""));

watch(
  () => props.document?.key,
  async (key) => {
    remoteText.value = "";
    error.value = null;
    if (!key || !props.document) return;
    loading.value = true;
    try {
      const response = await fetchRemoteFile(props.document.hostId, props.document.path, null);
      if (response.changed) remoteText.value = await response.blob.text();
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <Dialog :open="Boolean(document)" @update:open="(open) => !open && emit('close')">
    <DialogContent
      class="flex max-h-[min(44rem,calc(100vh-2rem))] max-w-[min(72rem,calc(100vw-2rem))] flex-col overflow-hidden"
    >
      <DialogHeader>
        <DialogTitle>{{ $t("app.fileConflictTitle") }}</DialogTitle>
        <DialogDescription>{{ $t("app.fileConflictDescription") }}</DialogDescription>
      </DialogHeader>
      <div v-if="error" class="text-sm text-destructive">{{ error }}</div>
      <div v-else class="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <section class="flex min-h-52 min-w-0 flex-col overflow-hidden">
          <h3 class="mb-1.5 text-xs font-medium text-ink-muted">{{ $t("app.localDraft") }}</h3>
          <CodeEditor
            :model-value="document?.draftText ?? ''"
            :language="language"
            read-only
            :line-wrapping="false"
          />
        </section>
        <section class="flex min-h-52 min-w-0 flex-col overflow-hidden">
          <h3 class="mb-1.5 text-xs font-medium text-ink-muted">{{ $t("app.remoteVersion") }}</h3>
          <CodeEditor
            :model-value="remoteText"
            :language="language"
            read-only
            :line-wrapping="false"
          />
        </section>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="emit('close')">{{ $t("app.cancel") }}</Button>
        <Button variant="secondary" :disabled="loading" @click="emit('discard')">
          {{ $t("app.loadRemoteVersion") }}
        </Button>
        <Button variant="destructive" @click="emit('overwrite')">
          {{ $t("app.forceOverwrite") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
