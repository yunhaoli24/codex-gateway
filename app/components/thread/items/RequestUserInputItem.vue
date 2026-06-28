<script setup lang="ts">
import { MessageSquareIcon } from "@lucide/vue";
import { computed, reactive, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useGatewayStore } from "@/stores/gateway";

const props = defineProps<{ item: Record<string, any> }>();
const { t } = useI18n();
const store = useGatewayStore();
const responding = ref(false);
const answers = reactive<Record<string, string>>({});
const questions = computed(() =>
  Array.isArray(props.item.params?.questions) ? props.item.params.questions : [],
);

async function submit() {
  if (!props.item.requestId || !store.selectedThreadId) {
    return;
  }
  const payload: Record<string, { answers: string[] }> = {};
  for (const question of questions.value) {
    const answer = answers[question.id];
    if (answer) {
      payload[question.id] = { answers: [answer] };
    }
  }
  responding.value = true;
  try {
    await store.respondToServerRequest(store.selectedThreadId, props.item.requestId, {
      answers: payload,
    });
  } finally {
    responding.value = false;
  }
}
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm text-ink-secondary"
  >
    <div class="flex items-center gap-2">
      <MessageSquareIcon class="size-4 shrink-0" />
      <span class="font-medium">{{ t("app.userInputRequest") }}</span>
      <Badge variant="outline">{{ item.status }}</Badge>
    </div>
    <div class="mt-3 space-y-3">
      <div v-for="question in questions" :key="question.id" class="rounded-md bg-surface/80 p-3">
        <div class="text-xs font-medium uppercase text-primary">{{ question.header }}</div>
        <div class="mt-1 text-sm">{{ question.question }}</div>
        <div v-if="question.options?.length" class="mt-2 flex flex-wrap gap-2">
          <Button
            v-for="option in question.options"
            :key="option.label"
            size="sm"
            :variant="answers[question.id] === option.label ? 'default' : 'outline'"
            @click="answers[question.id] = option.label"
          >
            {{ option.label }}
          </Button>
        </div>
        <Input
          v-if="question.isOther || !question.options?.length"
          v-model="answers[question.id]"
          class="mt-2 bg-surface"
          :type="question.isSecret ? 'password' : 'text'"
          :placeholder="t('app.answer')"
        />
      </div>
    </div>
    <div class="mt-3 flex gap-2">
      <Button
        size="sm"
        :disabled="responding || !questions.length"
        data-testid="request-user-input-submit"
        @click="submit"
      >
        {{ t("app.submitAnswer") }}
      </Button>
    </div>
  </div>
</template>
