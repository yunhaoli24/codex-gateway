<script setup lang="ts">
import { Attachments } from "@codex-gateway/ai-elements/attachments";
import type { ComposerAttachment } from "@/composables/composer/useComposerDraft";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import AttachmentChip from "./AttachmentChip.vue";

const props = defineProps<{
  files: ComposerAttachment[];
}>();

const emit = defineEmits<{
  remove: [id: string];
}>();

const navigation = useGatewayNavigationStore();
</script>

<template>
  <Attachments v-if="props.files.length" variant="inline" class="mb-2 max-w-full">
    <AttachmentChip
      v-for="file in props.files"
      :key="file.id"
      :file="file"
      :host-id="navigation.selectedHostId"
      @remove="emit('remove', $event)"
    />
  </Attachments>
</template>
