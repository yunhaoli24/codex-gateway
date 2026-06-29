import { computed, ref, type Ref } from "vue";
import type { ComposerTurnOptions } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";

type AttachedFile = {
  name: string;
  path: string;
  mimeType?: string | null;
  size: number;
  isImage: boolean;
  dataUrl?: string;
};

export function useComposerTurnSubmit(input: {
  turnText: Ref<string>;
  attachedFiles: Ref<AttachedFile[]>;
  clearDraft: () => void;
  selectedTurnOptions: () => ComposerTurnOptions;
  activeModel: Ref<string | null>;
  selectedEffort: Ref<string>;
  fileReferencesLabel: Ref<string>;
}) {
  const store = useGatewayStore();
  const planModeActive = ref(false);
  const hasComposerInput = computed(() =>
    Boolean(input.turnText.value.trim() || input.attachedFiles.value.length),
  );

  function activatePlanMode() {
    planModeActive.value = true;
    input.turnText.value = "";
  }

  async function startNewThread() {
    planModeActive.value = false;
    input.clearDraft();
    await store.startThread(input.selectedTurnOptions());
  }

  async function submitTurn() {
    const text = input.turnText.value.trim();
    if (!text && !input.attachedFiles.value.length) return;
    const files = [...input.attachedFiles.value];
    const remoteFiles = files.filter((file) => !file.isImage);
    const attachedImages = files.filter((file) => file.isImage);
    const collaborationMode = planCollaborationMode();
    input.clearDraft();
    planModeActive.value = false;
    await store.sendTurn(
      messageWithFileReferences(text, remoteFiles, input.fileReferencesLabel.value),
      {
        ...input.selectedTurnOptions(),
        collaborationMode,
        images: attachedImages
          .map((file) => ({ url: file.dataUrl, detail: "auto" as const }))
          .filter((image): image is { url: string; detail: "auto" } => Boolean(image.url)),
        files: remoteFiles,
      },
    );
  }

  function planCollaborationMode() {
    if (!planModeActive.value || !input.activeModel.value) {
      return undefined;
    }
    return {
      mode: "plan" as const,
      settings: {
        model: input.activeModel.value,
        reasoningEffort:
          input.selectedEffort.value === "default" ? null : input.selectedEffort.value,
        developerInstructions: null,
      },
    };
  }

  return {
    planModeActive,
    hasComposerInput,
    activatePlanMode,
    startNewThread,
    submitTurn,
  };
}

function messageWithFileReferences(text: string, remoteFiles: AttachedFile[], label: string) {
  const fileReferences = remoteFiles.map((file) => `- ${file.name}: ${file.path}`);
  return fileReferences.length
    ? `${text}${text ? "\n\n" : ""}${label}\n${fileReferences.join("\n")}`
    : text;
}
