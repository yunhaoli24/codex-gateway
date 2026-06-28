<script setup lang="ts">
import { KeyRoundIcon } from "@lucide/vue";
import { computed, ref } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGatewayStore } from "@/stores/gateway";

const props = defineProps<{ item: Record<string, any> }>();

const { t } = useI18n();
const store = useGatewayStore();
const responding = ref(false);
const accessToken = ref("");
const accountId = ref("");
const planType = ref("");
const params = computed(() => props.item.params || {});

async function submit() {
  if (!props.item.requestId || !store.selectedThreadId || !accessToken.value || !accountId.value) {
    return;
  }
  responding.value = true;
  try {
    await store.respondToServerRequest(store.selectedThreadId, props.item.requestId, {
      accessToken: accessToken.value,
      chatgptAccountId: accountId.value,
      chatgptPlanType: planType.value || null,
    });
  } finally {
    responding.value = false;
  }
}
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-3 text-sm text-amber-950"
  >
    <div class="flex items-center gap-2">
      <KeyRoundIcon class="size-4 shrink-0" />
      <span class="font-medium">{{ t("app.chatgptAuthRefreshRequest") }}</span>
      <Badge variant="outline">{{ item.status }}</Badge>
    </div>
    <div class="mt-2 text-amber-900">
      {{ t("app.chatgptAuthRefreshDescription") }}
    </div>
    <div class="mt-3 grid gap-2 rounded-md bg-white/80 p-3">
      <div>
        <div class="text-xs font-medium uppercase text-amber-700">{{ t("app.reason") }}</div>
        <div class="mt-1">{{ params.reason }}</div>
      </div>
      <div v-if="params.previousAccountId">
        <div class="text-xs font-medium uppercase text-amber-700">
          {{ t("app.previousAccount") }}
        </div>
        <div class="mt-1 font-mono text-xs">{{ params.previousAccountId }}</div>
      </div>
      <Input
        v-model="accessToken"
        type="password"
        autocomplete="off"
        :placeholder="t('app.accessToken')"
      />
      <Input v-model="accountId" autocomplete="off" :placeholder="t('app.chatgptAccountId')" />
      <Input v-model="planType" autocomplete="off" :placeholder="t('app.chatgptPlanType')" />
    </div>
    <div class="mt-3 flex gap-2">
      <Button
        size="sm"
        :disabled="responding || !accessToken || !accountId"
        data-testid="chatgpt-auth-refresh-submit"
        @click="submit"
      >
        {{ t("app.submitResponse") }}
      </Button>
    </div>
  </div>
</template>
