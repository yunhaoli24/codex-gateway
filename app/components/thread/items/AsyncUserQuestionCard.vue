<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { MessageSquareIcon } from "@lucide/vue";
import { Badge } from "@codex-gateway/ui/badge";
import { Button } from "@codex-gateway/ui/button";
import { Textarea } from "@codex-gateway/ui/textarea";
import {
  asyncQuestionsForItem,
  buildAsyncQuestionReply,
} from "~~/shared/thread-history/async-user-questions";
import type { ThreadHistoryItem } from "~~/shared/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId: number | null;
  threadId: string | null;
}>();

const { t } = useI18n();
const navigation = useGatewayNavigationStore();
const threadTurns = useGatewayThreadTurnsStore();
const answers = reactive<Record<number, string>>({});
const submitting = ref(false);
const submitted = ref(false);
const questions = computed(() => asyncQuestionsForItem(props.item));

const canSubmit = computed(
  () =>
    navigation.selectedHostId === props.hostId &&
    navigation.selectedThreadId === props.threadId &&
    questions.value.length > 0 &&
    questions.value.every((_, index) => (answers[index] ?? "").trim() !== ""),
);

function selectOption(index: number, option: string) {
  answers[index] = option;
}

async function submit() {
  if (!canSubmit.value || submitting.value || submitted.value) {
    return;
  }

  const text = buildAsyncQuestionReply(
    props.item,
    questions.value,
    questions.value.map((_, index) => answers[index] ?? ""),
  );
  if (text === null) {
    return;
  }

  submitting.value = true;
  try {
    submitted.value = await threadTurns.sendTurn(text);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="mt-4 max-w-3xl rounded-xl border border-primary/20 bg-primary/5 p-4 text-ink">
    <div class="flex items-center gap-2 text-sm font-medium text-primary">
      <MessageSquareIcon class="size-4 shrink-0" />
      <span>{{ t("app.asyncUserQuestion") }}</span>
      <Badge variant="outline" class="ml-auto">{{ questions.length }}</Badge>
    </div>
    <p class="mt-2 text-sm text-ink-secondary">{{ t("app.asyncUserQuestionHint") }}</p>

    <div class="mt-3 space-y-3">
      <div
        v-for="(question, index) in questions"
        :key="`${item.id}-${index}`"
        class="rounded-lg bg-surface/80 p-3"
      >
        <div class="text-sm font-medium">{{ question.title }}</div>
        <div v-if="question.options?.length" class="mt-2 flex flex-wrap gap-2">
          <Button
            v-for="option in question.options"
            :key="option"
            size="sm"
            :variant="answers[index] === option ? 'default' : 'outline'"
            :disabled="submitting || submitted"
            @click="selectOption(index, option)"
          >
            {{ option }}
          </Button>
        </div>
        <Textarea
          v-model="answers[index]"
          class="mt-2 min-h-20 bg-surface text-sm"
          :disabled="submitting || submitted"
          :placeholder="t('app.asyncUserQuestionAnswerPlaceholder')"
        />
      </div>
    </div>

    <div class="mt-3 flex items-center gap-3">
      <Button
        size="sm"
        :disabled="!canSubmit || submitting || submitted"
        data-testid="async-user-question-submit"
        @click="submit"
      >
        {{ submitted ? t("app.asyncUserQuestionSubmitted") : t("app.submitAnswer") }}
      </Button>
      <span v-if="submitting" class="text-xs text-ink-muted">{{ t("app.sending") }}</span>
    </div>
  </div>
</template>
