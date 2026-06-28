<script setup lang="ts">
import { WebhookIcon } from "@lucide/vue";
import { computed } from "vue";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import { threadItemText } from "@/utils/thread-items";

const props = defineProps<{ item: Record<string, any> }>();
const { t } = useI18n();
const text = computed(() => threadItemText(props.item));
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-4 py-3 text-ink-muted"
  >
    <div class="mb-2 flex items-center gap-2 text-[0.9375rem] font-medium text-accent-orange-deep">
      <WebhookIcon class="size-4" />
      <span>{{ t("app.hookPrompt") }}</span>
    </div>
    <MarkdownContent v-if="text" :content="text" compact />
  </div>
</template>
