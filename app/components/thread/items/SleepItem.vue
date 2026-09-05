<script setup lang="ts">
import type { ThreadHistoryItem } from "~~/shared/types";
import { Loader2Icon, TimerIcon } from "@lucide/vue";
import { computed } from "vue";
import { Checkpoint, CheckpointIcon } from "@codex-gateway/ai-elements/checkpoint";
import { isItemInProgress } from "@/utils/thread-items";

const props = defineProps<{ item: ThreadHistoryItem }>();

const { t } = useI18n();
const inProgress = computed(() => isItemInProgress(props.item));
</script>

<template>
  <!-- Waiting is a routine timeline checkpoint. It has no measured completion percentage, so
       a progress bar and a local countdown would imply precision the server does not provide. -->
  <Checkpoint class="max-w-4xl gap-2 py-1 text-[0.9375rem] text-ink-muted">
    <CheckpointIcon>
      <Loader2Icon v-if="inProgress" class="size-4 shrink-0 animate-spin" />
      <TimerIcon v-else class="size-4 shrink-0" />
    </CheckpointIcon>
    <span>{{ t("app.sleep") }}</span>
  </Checkpoint>
</template>
