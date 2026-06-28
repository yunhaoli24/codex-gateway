<script setup lang="ts">
import { AlertCircleIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { jsonPreview } from "@/utils/thread-items";

const props = defineProps<{ item: Record<string, any> }>();
const { t } = useI18n();
const title = computed(() => props.item.method || "server request");
const payload = computed(() => jsonPreview(props.item.params ?? {}));
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-3 py-2 text-sm text-accent-orange-deep"
  >
    <div class="flex items-center gap-2">
      <AlertCircleIcon class="size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ t("app.serverRequestWaiting") }} · {{ title }}</span>
      <Badge variant="outline">{{ item.status }}</Badge>
    </div>
    <ScrollArea class="mt-2 h-40 rounded-md bg-surface/70">
      <pre class="p-2 text-xs leading-5 text-ink-secondary">{{ payload }}</pre>
    </ScrollArea>
  </div>
</template>
