<script setup lang="ts">
import { ChatStickToBottomScrollArea } from "@/components/common/chat-virtualizer";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import { languageFromPath } from "@/utils/code-highlight";
import {
  fileChangeDiff,
  fileChangeDiffMarkdown,
  fileChangeFollowKey,
  fileChangePath,
} from "./file-change-utils";

const props = defineProps<{
  change: Record<string, any>;
}>();
</script>

<template>
  <ChatStickToBottomScrollArea
    v-if="fileChangeDiff(props.change)"
    class="diff-markdown max-h-[min(55vh,26rem)] border-t border-hairline bg-surface"
    viewport-class="max-h-[min(55vh,26rem)]"
    horizontal
    natural-height
    :threshold="48"
    :follow-key="fileChangeFollowKey(props.change)"
  >
    <MarkdownContent
      :content="fileChangeDiffMarkdown(props.change)"
      :diff-language="languageFromPath(fileChangePath(props.change))"
      compact
    />
  </ChatStickToBottomScrollArea>
  <div v-else class="border-t border-hairline px-3 py-2 text-sm text-ink-faint">
    {{ $t("app.noDiff") }}
  </div>
</template>
