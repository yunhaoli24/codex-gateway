<script setup lang="ts">
import { BotIcon, ChevronDownIcon, ChevronRightIcon } from "@lucide/vue";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import { isItemInProgress } from "@/utils/thread-items";

const props = defineProps<{ item: Record<string, any> }>();
const { t } = useI18n();

const title = computed(() => props.item.tool || t("app.collabAgentToolCall"));
const agents = computed(() => Object.entries(props.item.agentsStates || {}));
</script>

<template>
  <div class="max-w-4xl text-[#5f6970]">
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <BotIcon class="size-4 text-[#8d9499]" />
      <span class="min-w-0 truncate">{{ title }}</span>
      <Badge variant="secondary">{{ item.status }}</Badge>
      <Badge v-if="isItemInProgress(item)" variant="outline">{{ t("app.running") }}</Badge>
    </div>
    <Collapsible
      v-if="item.prompt || agents.length || item.receiverThreadIds?.length"
      v-slot="{ open }"
      class="mt-2 rounded-lg border border-black/10 bg-[#fbfbfb]"
    >
      <CollapsibleTrigger
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/[0.03]"
      >
        <ChevronDownIcon v-if="open" class="size-4 shrink-0 text-[#9aa1a6]" />
        <ChevronRightIcon v-else class="size-4 shrink-0 text-[#9aa1a6]" />
        <span class="min-w-0 flex-1 truncate">{{ t("app.agentDetails") }}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div class="space-y-3 border-t border-black/10 px-3 py-3 text-sm leading-6">
          <MarkdownContent v-if="item.prompt" :content="item.prompt" compact />
          <div v-if="item.receiverThreadIds?.length" class="space-y-1">
            <div class="text-xs font-medium uppercase text-[#9aa1a6]">
              {{ t("app.receiverThreads") }}
            </div>
            <div
              v-for="threadId in item.receiverThreadIds"
              :key="threadId"
              class="truncate font-mono text-xs text-[#5f6970]"
            >
              {{ threadId }}
            </div>
          </div>
          <div v-if="agents.length" class="space-y-2">
            <div class="text-xs font-medium uppercase text-[#9aa1a6]">
              {{ t("app.agentStates") }}
            </div>
            <div
              v-for="[threadId, state] in agents"
              :key="threadId"
              class="rounded-md border border-black/10 bg-white px-2 py-1"
            >
              <div class="truncate font-mono text-xs text-[#5f6970]">{{ threadId }}</div>
              <div class="mt-1 flex items-center gap-2 text-xs text-[#8d9499]">
                <Badge variant="outline">{{ (state as any).status }}</Badge>
                <span v-if="(state as any).message" class="truncate">{{
                  (state as any).message
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
