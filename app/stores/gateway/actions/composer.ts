import type { ComposerDraft } from "../types";
import type { GatewayStoreContext } from "../types";
import { selectedThreadKey } from "../thread-utils/identity";

export function createComposerActions(ctx: GatewayStoreContext) {
  return {
    saveSelectedComposerDraft(draft: ComposerDraft) {
      const key = selectedThreadKey(ctx.state.selectedHostId, ctx.state.selectedThreadId);
      if (!key) {
        return;
      }
      ctx.state.composerDraftsByKey = {
        ...ctx.state.composerDraftsByKey,
        [key]: {
          text: draft.text,
          attachedFiles: [...draft.attachedFiles],
        },
      };
    },

    clearSelectedComposerDraft() {
      const key = selectedThreadKey(ctx.state.selectedHostId, ctx.state.selectedThreadId);
      if (!key) {
        return;
      }
      const { [key]: _removed, ...drafts } = ctx.state.composerDraftsByKey;
      ctx.state.composerDraftsByKey = drafts;
    },
  };
}
