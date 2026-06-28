import { computed, nextTick, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { UploadedFileRecord } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";

export type ComposerAttachment = UploadedFileRecord & { id: string; dataUrl?: string };

export function useComposerDraft() {
  const store = useGatewayStore();
  const { selectedHostId, selectedThreadId, selectedComposerDraft } = storeToRefs(store);
  const turnText = ref("");
  const attachedFiles = ref<ComposerAttachment[]>([]);
  const draftKey = computed(() =>
    selectedHostId.value && selectedThreadId.value
      ? `${selectedHostId.value}:${selectedThreadId.value}`
      : "",
  );
  let syncingDraft = false;

  watch(
    draftKey,
    () => {
      syncingDraft = true;
      turnText.value = selectedComposerDraft.value.text;
      attachedFiles.value = [...selectedComposerDraft.value.attachedFiles];
      void nextTick(() => {
        syncingDraft = false;
      });
    },
    { immediate: true },
  );

  watch(
    [turnText, attachedFiles],
    () => {
      if (syncingDraft || !draftKey.value) {
        return;
      }
      store.saveSelectedComposerDraft({
        text: turnText.value,
        attachedFiles: attachedFiles.value,
      });
    },
    { deep: true },
  );

  function clearDraft() {
    turnText.value = "";
    attachedFiles.value = [];
    store.clearSelectedComposerDraft();
  }

  return {
    turnText,
    attachedFiles,
    clearDraft,
  };
}
