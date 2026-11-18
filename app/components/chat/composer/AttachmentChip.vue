<script setup lang="ts">
import { computed } from "vue";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
} from "@codex-gateway/ai-elements/attachments";
import type { ComposerAttachment } from "@/composables/composer/useComposerDraft";
import { useAuthorizedObjectUrl } from "@/composables/files/useAuthorizedObjectUrl";
import { remoteImageSource } from "@/utils/remote-image-source";
import { presentComposerAttachment } from "./attachment-presentation";

const props = defineProps<{ file: ComposerAttachment; hostId: number | null }>();
const emit = defineEmits<{ remove: [id: string] }>();
const { t } = useI18n();
const source = computed(() => {
  if (!props.file.isImage) return "";
  if (props.file.dataUrl !== undefined && props.file.dataUrl !== "") return props.file.dataUrl;
  return props.hostId === null ? "" : remoteImageSource(props.hostId, props.file.path);
});
// Forked localImage parts are remote files, not public URLs. Reuse the timeline's authenticated
// Blob cache and component-owned URL cleanup; do not copy image bytes into every fork draft.
const { objectUrl } = useAuthorizedObjectUrl(source);
const presentation = computed(() =>
  presentComposerAttachment(props.file, props.file.isImage ? objectUrl.value : props.file.path),
);
</script>

<template>
  <Attachment :data="presentation.data" class="max-w-full" @remove="emit('remove', file.id)">
    <AttachmentPreview />
    <AttachmentInfo class="max-w-48" />
    <AttachmentRemove :label="t('app.removeAttachment')" class="opacity-100" />
  </Attachment>
</template>
