<script setup lang="ts">
import { computed } from "vue";
import { Message, MessageContent } from "@codex-gateway/ai-elements/message";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import ThreadImageAttachment from "@/components/thread/attachments/ThreadImageAttachment.vue";
import { threadItemText } from "@/utils/thread-items";
import type { ThreadHistoryItem } from "~~/shared/types";
import { recordFromUnknown } from "~~/shared/utils/records";
import { remoteImageSource } from "@/utils/remote-image-source";

const props = defineProps<{
  item: ThreadHistoryItem;
  hostId: number | null;
}>();

const text = computed(() => threadItemText(props.item));
type ImagePart = Record<string, unknown> & { type: "image" | "localImage" };

function isImagePart(part: Record<string, unknown> | null): part is ImagePart {
  return part?.type === "image" || part?.type === "localImage";
}

const imageParts = computed(() => {
  if (!Array.isArray(props.item.content)) {
    return [];
  }
  return props.item.content
    .map(recordFromUnknown)
    .filter(isImagePart)
    .map((part, index: number) => ({
      id: `${props.item.id || props.item.clientId || "image"}-${index}`,
      type: part.type,
      url: typeof part.url === "string" ? part.url : "",
      path: typeof part.path === "string" ? part.path : "",
      detail: typeof part.detail === "string" ? part.detail : null,
    }));
});

function imageSource(image: { type: string; url: string; path: string }) {
  if (image.type === "image") {
    return image.url;
  }
  if (image.type === "localImage" && props.hostId && image.path) {
    return remoteImageSource(props.hostId, image.path);
  }
  return "";
}
</script>

<template>
  <Message from="user" class="min-w-0 max-w-full">
    <MessageContent
      class="thread-user-message min-w-0 max-w-full space-y-3 rounded-2xl bg-canvas-soft px-4 py-4 text-[0.9375rem] leading-7 text-ink group-[.is-user]:rounded-2xl group-[.is-user]:bg-canvas-soft group-[.is-user]:py-4 group-[.is-user]:text-ink md:max-w-3xl md:px-5 md:group-[.is-user]:px-5"
    >
      <div v-if="imageParts.length" class="grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        <template v-for="image in imageParts" :key="image.id">
          <ThreadImageAttachment
            v-if="imageSource(image)"
            :source="imageSource(image)"
            :label="image.path || null"
            :detail="image.detail"
          />
        </template>
      </div>
      <MarkdownContent v-if="text" :content="text" compact />
    </MessageContent>
  </Message>
</template>

<style scoped>
.thread-user-message :deep(.markdown-content),
.thread-user-message :deep(.markdown-content p),
.thread-user-message :deep(.markdown-content li),
.thread-user-message :deep(.markdown-content code),
.thread-user-message :deep(.markdown-content a) {
  overflow-wrap: anywhere;
}
</style>
