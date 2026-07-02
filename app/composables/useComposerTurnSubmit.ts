import { computed, type Ref } from "vue";
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
  const interruptingTurn = ref(false);
  const planModeActive = computed(() => store.selectedThreadCollaborationMode === "plan");
  const hasComposerInput = computed(() =>
    Boolean(input.turnText.value.trim() || input.attachedFiles.value.length),
  );

  function activatePlanMode() {
    store.setSelectedThreadCollaborationMode("plan");
    input.turnText.value = "";
  }

  async function startNewThread() {
    input.clearDraft();
    await store.startThread(input.selectedTurnOptions());
  }

  async function submitTurn() {
    const text = input.turnText.value.trim();
    if (!text && !input.attachedFiles.value.length) return;
    if (planModeActive.value) {
      store.dismissLatestSelectedPlanPrompt();
    }
    const files = [...input.attachedFiles.value];
    const remoteFiles = files.filter((file) => !file.isImage);
    const attachedImages = files.filter((file) => file.isImage);
    const collaborationMode = planCollaborationMode();
    input.clearDraft();
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

  async function interruptTurn() {
    if (interruptingTurn.value) {
      return;
    }
    interruptingTurn.value = true;
    try {
      await store.interruptActiveTurn();
    } finally {
      interruptingTurn.value = false;
    }
  }

  function planCollaborationMode() {
    if (!input.activeModel.value) {
      return undefined;
    }
    const mode = planModeActive.value ? "plan" : "default";
    return {
      mode,
      settings: {
        model: input.activeModel.value,
        reasoningEffort:
          input.selectedEffort.value === "default" ? null : input.selectedEffort.value,
        developerInstructions: null,
      },
    } as const;
  }

  return {
    planModeActive,
    hasComposerInput,
    interruptingTurn,
    activatePlanMode,
    startNewThread,
    submitTurn,
    interruptTurn,
  };
}

function messageWithFileReferences(text: string, remoteFiles: AttachedFile[], label: string) {
  const fileReferences = remoteFiles.map((file) => `- ${file.name}: ${file.path}`);
  return fileReferences.length
    ? `${text}${text ? "\n\n" : ""}${label}\n${fileReferences.join("\n")}`
    : text;
}
