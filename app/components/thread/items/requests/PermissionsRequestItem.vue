<script setup lang="ts">
import { threadItemStatusLabel } from "@/utils/thread-item-status";
import type { ThreadHistoryItem } from "~~/shared/types";
import { ShieldQuestionIcon } from "@lucide/vue";
import { computed } from "vue";
import { ConfirmationAction } from "@codex-gateway/ai-elements/confirmation";
import { Badge } from "@codex-gateway/ui/badge";
import StaticJsonCodeBlock from "@/components/common/StaticJsonCodeBlock.vue";
import CodexApprovalConfirmation from "@/components/thread/items/approval/CodexApprovalConfirmation.vue";
import { projectCodexApproval } from "@/components/thread/items/approval/presentation";
import { useServerRequestResponder } from "@/composables/thread/useServerRequestResponder";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId: number | null;
  threadId: string | null;
}>();

const { t } = useI18n();
const params = computed(() => props.item.params || {});
const requestId = computed(() => props.item.requestId);
const {
  canRespond,
  responding,
  respond: respondToRequest,
} = useServerRequestResponder({
  hostId: computed(() => props.hostId),
  threadId: computed(() => props.threadId),
  requestId,
});
const requested = computed(() => params.value.permissions || {});
const networkEnabled = computed(() => requested.value.network?.enabled === true);
const fileSystem = computed(() => requested.value.fileSystem || null);
const readPaths = computed(() =>
  Array.isArray(fileSystem.value?.read) ? fileSystem.value.read : [],
);
const writePaths = computed(() =>
  Array.isArray(fileSystem.value?.write) ? fileSystem.value.write : [],
);
const entries = computed(() =>
  Array.isArray(fileSystem.value?.entries) ? fileSystem.value.entries : [],
);
const approvalPresentation = computed(() =>
  projectCodexApproval({
    kind: "permissions",
    requestId: requestId.value,
    pending: requestId.value !== null && requestId.value !== undefined && requestId.value !== "",
    canRespond: canRespond.value,
    presentationId: `permissions-${String(props.item.id ?? "request")}`,
    permissions: requested.value,
  }),
);

async function respond(result: unknown) {
  await respondToRequest(result);
}
</script>

<template>
  <CodexApprovalConfirmation class="max-w-4xl" :presentation="approvalPresentation">
    <template #title>
      <ShieldQuestionIcon class="size-4 shrink-0" />
      <span class="font-medium">{{ t("app.permissionsRequest") }}</span>
      <Badge variant="outline">{{ threadItemStatusLabel(item.status, t) }}</Badge>
    </template>
    <div v-if="params.reason" class="mt-2 text-accent-orange-deep">{{ params.reason }}</div>
    <div class="mt-3 grid gap-2">
      <div v-if="params.cwd" class="rounded-md bg-surface/80 px-3 py-2">
        <div class="text-xs font-medium uppercase text-accent-orange-deep">
          {{ t("app.workingDirectory") }}
        </div>
        <div class="mt-1 font-mono text-xs">{{ params.cwd }}</div>
      </div>
      <div v-if="networkEnabled" class="rounded-md bg-surface/80 px-3 py-2">
        <div class="text-xs font-medium uppercase text-accent-orange-deep">
          {{ t("app.networkAccess") }}
        </div>
        <div class="mt-1">{{ t("app.networkAccessRequested") }}</div>
      </div>
      <div
        v-if="readPaths.length || writePaths.length || entries.length"
        class="rounded-md bg-surface/80 px-3 py-2"
      >
        <div class="text-xs font-medium uppercase text-accent-orange-deep">
          {{ t("app.fileSystemAccess") }}
        </div>
        <div v-if="readPaths.length" class="mt-2">
          <div class="text-xs font-medium text-accent-orange-deep">{{ t("app.readAccess") }}</div>
          <div v-for="path in readPaths" :key="`read-${path}`" class="mt-1 font-mono text-xs">
            {{ path }}
          </div>
        </div>
        <div v-if="writePaths.length" class="mt-2">
          <div class="text-xs font-medium text-accent-orange-deep">
            {{ t("app.writeAccess") }}
          </div>
          <div v-for="path in writePaths" :key="`write-${path}`" class="mt-1 font-mono text-xs">
            {{ path }}
          </div>
        </div>
        <StaticJsonCodeBlock v-if="entries.length" class="mt-2" :value="entries" />
      </div>
    </div>
    <template #actions>
      <ConfirmationAction
        v-for="action in approvalPresentation.actions"
        :key="action.id"
        size="sm"
        :variant="action.variant"
        :disabled="responding"
        :data-testid="action.testId"
        @click="respond(action.result)"
      >
        {{ t(action.label) }}
      </ConfirmationAction>
    </template>
  </CodexApprovalConfirmation>
</template>
