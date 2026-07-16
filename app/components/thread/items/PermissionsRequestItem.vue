<script setup lang="ts">
import { ShieldQuestionIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useServerRequestResponder } from "@/composables/thread/useServerRequestResponder";
import { jsonPreview } from "@/utils/thread-items";

const props = defineProps<{
  item: Record<string, any>;
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

async function approve(scope: "turn" | "session") {
  await respond({
    permissions: requested.value,
    scope,
  });
}

async function decline() {
  await respond({
    permissions: {},
    scope: "turn",
  });
}

async function respond(result: unknown) {
  await respondToRequest(result);
}
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-3 py-3 text-sm text-ink-secondary"
  >
    <div class="flex items-center gap-2">
      <ShieldQuestionIcon class="size-4 shrink-0" />
      <span class="font-medium">{{ t("app.permissionsRequest") }}</span>
      <Badge variant="outline">{{ item.status }}</Badge>
    </div>
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
        <ScrollArea v-if="entries.length" class="mt-2 h-40 rounded-md bg-surface">
          <pre class="p-2 text-xs">{{ jsonPreview(entries) }}</pre>
        </ScrollArea>
      </div>
    </div>
    <div v-if="canRespond" class="mt-3 flex flex-wrap gap-2">
      <Button
        size="sm"
        :disabled="responding"
        data-testid="permissions-approval-turn"
        @click="approve('turn')"
      >
        {{ t("app.approveForTurn") }}
      </Button>
      <Button
        size="sm"
        variant="outline"
        :disabled="responding"
        data-testid="permissions-approval-session"
        @click="approve('session')"
      >
        {{ t("app.approveForSession") }}
      </Button>
      <Button
        size="sm"
        variant="outline"
        :disabled="responding"
        data-testid="permissions-approval-decline"
        @click="decline"
      >
        {{ t("app.decline") }}
      </Button>
    </div>
    <div v-else class="mt-3 rounded-md bg-surface/80 px-3 py-2 text-xs text-ink-muted">
      {{ t("app.serverRequestResolved") }}
    </div>
  </div>
</template>
