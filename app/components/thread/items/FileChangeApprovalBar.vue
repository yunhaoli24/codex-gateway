<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { useServerRequestResponder } from "@/composables/thread/useServerRequestResponder";

const props = defineProps<{
  pendingApproval: Record<string, any>;
  hostId: number | null;
  threadId: string | null;
}>();

const { t } = useI18n();
const requestId = computed(() => props.pendingApproval?.requestId);
const {
  canRespond,
  responding,
  respond: respondToRequest,
} = useServerRequestResponder({
  hostId: computed(() => props.hostId),
  threadId: computed(() => props.threadId),
  requestId,
});

async function respond(decision: "accept" | "decline") {
  await respondToRequest({ decision });
}
</script>

<template>
  <div
    class="mt-3 rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-3 py-2 text-sm text-accent-orange-deep"
  >
    <div class="font-medium">{{ t("app.fileApprovalRequired") }}</div>
    <div v-if="pendingApproval.params?.reason" class="mt-1 text-accent-orange-deep">
      {{ pendingApproval.params.reason }}
    </div>
    <div v-if="canRespond" class="mt-2 flex flex-wrap gap-2">
      <Button
        size="sm"
        :disabled="responding"
        data-testid="file-approval-accept"
        @click="respond('accept')"
      >
        {{ t("app.approve") }}
      </Button>
      <Button
        size="sm"
        variant="outline"
        :disabled="responding"
        data-testid="file-approval-decline"
        @click="respond('decline')"
      >
        {{ t("app.decline") }}
      </Button>
    </div>
    <div v-else class="mt-2 text-xs text-accent-orange-deep">
      {{ t("app.serverRequestResolved") }}
    </div>
  </div>
</template>
