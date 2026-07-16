import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import type { ComposerDraft } from "@/stores/gateway/types";
import { selectedThreadKey } from "@/stores/gateway/thread-utils/identity";

export function createComposerActions() {
  return {
    saveSelectedComposerDraft(draft: ComposerDraft) {
      const composer = useGatewayComposerStore();
      const navigation = useGatewayNavigationStore();
      const key = selectedThreadKey(navigation.selectedHostId, navigation.selectedThreadId);
      if (!key) return;
      composer.composerDraftsByKey = {
        ...composer.composerDraftsByKey,
        [key]: { text: draft.text, attachedFiles: [...draft.attachedFiles] },
      };
    },

    clearSelectedComposerDraft() {
      const composer = useGatewayComposerStore();
      const navigation = useGatewayNavigationStore();
      const key = selectedThreadKey(navigation.selectedHostId, navigation.selectedThreadId);
      if (!key) return;
      const { [key]: _removed, ...drafts } = composer.composerDraftsByKey;
      composer.composerDraftsByKey = drafts;
    },
  };
}
