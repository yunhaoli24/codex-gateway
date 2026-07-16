<script setup lang="ts">
import { KeyRoundIcon } from "@lucide/vue";
import { computed, ref } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerRequestResponder } from "@/composables/thread/useServerRequestResponder";

const props = defineProps<{
  item: Record<string, any>;
  hostId: number | null;
  threadId: string | null;
}>();

const { t } = useI18n();
const accessToken = ref("");
const accountId = ref("");
const planType = ref("");
const params = computed(() => props.item.params || {});
const requestId = computed(() => props.item.requestId);
const { canRespond, responding, respond } = useServerRequestResponder({
  hostId: computed(() => props.hostId),
  threadId: computed(() => props.threadId),
  requestId,
});

async function submit() {
  if (!accessToken.value || !accountId.value) {
    return;
  }
  await respond({
    accessToken: accessToken.value,
    chatgptAccountId: accountId.value,
    chatgptPlanType: planType.value || null,
  });
}
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-3 py-3 text-sm text-ink-secondary"
  >
    <div class="flex items-center gap-2">
      <KeyRoundIcon class="size-4 shrink-0" />
      <span class="font-medium">{{ t("app.chatgptAuthRefreshRequest") }}</span>
      <Badge variant="outline">{{ item.status }}</Badge>
    </div>
    <div class="mt-2 text-accent-orange-deep">
      {{ t("app.chatgptAuthRefreshDescription") }}
    </div>
    <div class="mt-3 grid gap-2 rounded-md bg-surface/80 p-3">
      <div>
        <div class="text-xs font-medium uppercase text-accent-orange-deep">
          {{ t("app.reason") }}
        </div>
        <div class="mt-1">{{ params.reason }}</div>
      </div>
      <div v-if="params.previousAccountId">
        <div class="text-xs font-medium uppercase text-accent-orange-deep">
          {{ t("app.previousAccount") }}
        </div>
        <div class="mt-1 font-mono text-xs">{{ params.previousAccountId }}</div>
      </div>
      <Input
        v-if="canRespond"
        v-model="accessToken"
        type="password"
        autocomplete="off"
        :placeholder="t('app.accessToken')"
      />
      <Input
        v-if="canRespond"
        v-model="accountId"
        autocomplete="off"
        :placeholder="t('app.chatgptAccountId')"
      />
      <Input
        v-if="canRespond"
        v-model="planType"
        autocomplete="off"
        :placeholder="t('app.chatgptPlanType')"
      />
    </div>
    <div v-if="canRespond" class="mt-3 flex gap-2">
      <Button
        size="sm"
        :disabled="responding || !accessToken || !accountId"
        data-testid="chatgpt-auth-refresh-submit"
        @click="submit"
      >
        {{ t("app.submitResponse") }}
      </Button>
    </div>
    <div v-else class="mt-3 rounded-md bg-surface/80 px-3 py-2 text-xs text-ink-muted">
      {{ t("app.serverRequestResolved") }}
    </div>
  </div>
</template>
