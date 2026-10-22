<script setup lang="ts">
import { CheckIcon, FileIcon, Loader2Icon, UploadIcon, XIcon } from "@lucide/vue";
import { computed } from "vue";
import { Button } from "@codex-gateway/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@codex-gateway/ui/popover";
import { Progress } from "@codex-gateway/ui/progress";
import { formatBytes } from "@/utils/host-metrics";
import type { WorkspaceFileUploadState } from "./useWorkspaceFileUpload";

const props = defineProps<{
  state: WorkspaceFileUploadState | null;
  uploading: boolean;
  path: string;
}>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ select: [] }>();
const { t } = useI18n();
const percent = computed(() => {
  if (props.state?.phase === "complete" || props.state?.phase === "saving") return 100;
  return props.state?.total ? Math.min(100, (props.state.loaded / props.state.total) * 100) : null;
});
const succeeded = computed(
  () => props.state?.files.filter((file) => file.status === "success").length ?? 0,
);
const failed = computed(() => props.state?.files.some((file) => file.status === "error") ?? false);
const title = computed(() => {
  if (!props.state) return t("app.uploadFiles");
  if (props.state.phase === "failed" || failed.value) return t("app.remoteFileUploadFailed");
  return t(`app.fileUploadPhase.${props.state.phase}`);
});

function activate() {
  if (props.state) open.value = true;
  else emit("select");
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverAnchor as-child>
      <Button
        variant="ghost"
        size="icon-sm"
        class="relative shrink-0"
        :disabled="!path"
        :aria-label="t('app.uploadFiles')"
        :aria-expanded="open"
        aria-haspopup="dialog"
        :title="state ? title : t('app.uploadFilesTo', { path })"
        @click="activate"
      >
        <Loader2Icon v-if="uploading" class="size-3.5 animate-spin text-primary" />
        <UploadIcon v-else class="size-3.5" />
        <span v-if="failed" class="absolute right-1 top-1 size-1.5 rounded-full bg-destructive" />
      </Button>
    </PopoverAnchor>
    <!-- Portal the transfer UI outside the tree's scroll/flex layout. Progress and completion
         must never insert rows above the directory list or move the user's selected file. -->
    <PopoverContent
      v-if="state"
      align="end"
      class="max-h-[var(--reka-popover-content-available-height)] w-[min(24rem,calc(100vw-2rem))] gap-3 overflow-y-auto rounded-xl border border-hairline bg-canvas p-4 text-sm shadow-xl"
      data-testid="workspace-upload-progress"
      @open-auto-focus.prevent
    >
      <div class="flex min-w-0 items-center gap-2">
        <Loader2Icon v-if="uploading" class="size-4 shrink-0 animate-spin text-primary" />
        <XIcon v-else-if="failed" class="size-4 shrink-0 text-destructive" />
        <CheckIcon v-else class="size-4 shrink-0 text-primary" />
        <span class="min-w-0 flex-1 font-medium" role="status" aria-live="polite">{{ title }}</span>
        <Button variant="ghost" size="icon-sm" :aria-label="t('app.close')" @click="open = false">
          <XIcon class="size-4" />
        </Button>
      </div>
      <p class="truncate text-xs text-ink-muted" :title="state.destination">
        {{ state.destination }}
      </p>
      <div v-if="state.phase !== 'failed'" class="space-y-1.5">
        <Progress :model-value="percent" :aria-label="t('app.uploadFiles')" class="h-1.5" />
        <div class="flex justify-between gap-3 text-xs text-ink-muted tabular-nums">
          <span v-if="state.phase === 'complete'">{{
            t("app.fileUploadCount", { count: succeeded, total: state.files.length })
          }}</span>
          <span v-else-if="state.phase === 'saving'">{{ t("app.fileUploadRemotePending") }}</span>
          <span v-else
            >{{ formatBytes(state.loaded)
            }}<template v-if="state.total !== null">
              / {{ formatBytes(state.total) }}</template
            ></span
          >
          <span v-if="percent !== null && state.phase === 'uploading'" class="shrink-0"
            >{{ percent.toFixed(0) }}%</span
          >
        </div>
      </div>
      <p v-if="state.error" role="alert" class="break-words text-xs text-destructive">
        {{ state.error }}
      </p>
      <ul
        class="max-h-48 space-y-2 overflow-y-auto overscroll-contain"
        :aria-label="t('app.uploadFiles')"
      >
        <li v-for="(file, index) in state.files" :key="index" class="flex items-start gap-2">
          <FileIcon class="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs" :title="file.name">{{ file.name }}</p>
            <p v-if="file.error" class="break-words text-xs text-destructive">{{ file.error }}</p>
            <p v-else class="text-xs text-ink-muted">{{ formatBytes(file.size) }}</p>
          </div>
          <CheckIcon
            v-if="file.status === 'success'"
            :aria-label="t('app.fileUploadSucceeded')"
            class="size-4 shrink-0 text-primary"
          />
          <XIcon v-else-if="file.status === 'error'" class="size-4 shrink-0 text-destructive" />
        </li>
      </ul>
      <Button v-if="!uploading" variant="outline" size="sm" class="w-full" @click="emit('select')">
        <UploadIcon class="size-3.5" />
        {{ t("app.selectUploadFiles") }}
      </Button>
    </PopoverContent>
  </Popover>
</template>
