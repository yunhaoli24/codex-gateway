import { computed } from "vue";
import { storeToRefs } from "pinia";
import type { SlashCommand } from "@/composables/useSlashCommands";
import { useAttachmentUpload } from "@/composables/useAttachmentUpload";
import { useComposerDraft } from "@/composables/useComposerDraft";
import { useComposerSlashActions } from "@/composables/useComposerSlashActions";
import { useComposerTurnSubmit } from "@/composables/useComposerTurnSubmit";
import { useSlashCommands } from "@/composables/useSlashCommands";
import { useThreadSettingsControls } from "@/composables/useThreadSettingsControls";
import { useGatewayStore } from "@/stores/gateway";
import { latestThreadPlanItem, planItemSummary } from "@/utils/thread-plan";

export function useComposerController() {
  const store = useGatewayStore();
  const { t } = useI18n();
  const {
    selectedHostId,
    selectedProjectId,
    selectedThreadId,
    selectedThreadStatus,
    selectedThreadGoal,
    selectedThreadGoalObservedAt,
    selectedThreadTokenUsage,
    history,
    models,
    loadingModels,
  } = storeToRefs(store);

  const { turnText, attachedFiles, clearDraft } = useComposerDraft();
  const settings = useThreadSettingsControls();
  const attachmentUpload = useAttachmentUpload(selectedHostId, attachedFiles);
  const selectedRuntime = computed(() =>
    selectedHostId.value && selectedThreadId.value
      ? store.threadRuntimeProjection(selectedHostId.value, selectedThreadId.value)
      : null,
  );
  const isThreadRunning = computed(() => Boolean(selectedRuntime.value?.canInterrupt));
  const composerInputEnabled = computed(() =>
    Boolean(selectedThreadId.value || selectedProjectId.value),
  );
  const selectedTurnOptions = () => {
    const effort =
      settings.selectedEffort.value === "default" ? undefined : settings.selectedEffort.value;
    return {
      model: settings.activeModel.value || undefined,
      effort,
      approvalPolicy:
        settings.selectedApprovalMode.value === "custom"
          ? undefined
          : settings.selectedApprovalMode.value,
    };
  };
  const submit = useComposerTurnSubmit({
    turnText,
    attachedFiles,
    clearDraft,
    selectedTurnOptions,
    activeModel: settings.activeModel,
    selectedEffort: settings.selectedEffort,
    fileReferencesLabel: computed(() => t("app.attachedFileReferences")),
  });
  const goalInputActive = computed(() => /^\/goal(?:\s|$)/i.test(turnText.value.trimStart()));
  const activePlanSummary = computed(() =>
    submit.planModeActive.value ? planItemSummary(latestThreadPlanItem(history.value)) : "",
  );
  const canSendTurn = computed(() =>
    Boolean(
      selectedThreadId.value &&
      submit.hasComposerInput.value &&
      !attachmentUpload.uploadingAttachments.value,
    ),
  );
  const canInterruptTurn = computed(() =>
    Boolean(selectedThreadId.value && isThreadRunning.value && !submit.hasComposerInput.value),
  );
  const canUsePrimaryAction = computed(() =>
    Boolean(
      (canSendTurn.value || canInterruptTurn.value) && !attachmentUpload.uploadingAttachments.value,
    ),
  );
  const sendButtonLabel = computed(() => {
    if (submit.hasComposerInput.value) return t("app.send");
    if (isThreadRunning.value) return t("app.interruptTurn");
    if (selectedThreadStatus.value === "completed") return t("app.completed");
    if (selectedThreadStatus.value === "failed") return t("app.failed");
    if (selectedThreadStatus.value === "interrupted") return t("app.interrupted");
    return t("app.send");
  });
  const slashCommands = computed<SlashCommand[]>(() => [
    {
      id: "new",
      command: t("app.slashCommandNew"),
      title: t("app.slashCommandNewTitle"),
      description: t("app.slashCommandNewDescription"),
    },
    ...(selectedThreadId.value
      ? [
          {
            id: "plan" as const,
            command: t("app.slashCommandPlan"),
            title: t("app.slashCommandPlanTitle"),
            description: t("app.slashCommandPlanDescription"),
          },
          {
            id: "goal" as const,
            command: t("app.slashCommandGoal"),
            title: t("app.slashCommandGoalTitle"),
            description: t("app.slashCommandGoalDescription"),
          },
        ]
      : []),
  ]);
  const slashActions = useComposerSlashActions({
    text: turnText,
    selectedThreadId,
    startNewThread: submit.startNewThread,
    activatePlanMode: submit.activatePlanMode,
    missingGoalObjectiveMessage: computed(() => t("app.goalObjectiveRequired")),
  });
  const slashCommandsState = useSlashCommands({
    text: turnText,
    commands: slashCommands,
    enabled: composerInputEnabled,
    onSelect: slashActions.runSlashCommand,
  });

  async function submitComposer() {
    if (await slashActions.executeInlineSlashCommand()) {
      slashCommandsState.dismiss();
      return;
    }
    await submit.submitTurn();
  }

  function handleComposerKeydown(event: KeyboardEvent) {
    if (event.isComposing) {
      return;
    }
    if (slashCommandsState.handleKeydown(event)) {
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (!selectedThreadId.value) {
      return;
    }
    void submitComposer();
  }

  function handlePrimaryAction() {
    if (canInterruptTurn.value) {
      void submit.interruptTurn();
      return;
    }
    void submitComposer();
  }

  return {
    activePlanSummary,
    attachedFiles,
    goalInputActive,
    selectedThreadGoal,
    selectedThreadGoalObservedAt,
    turnText,
    uploadInputRef: attachmentUpload.uploadInputRef,
    uploadingAttachments: attachmentUpload.uploadingAttachments,
    handleAttachmentChange: attachmentUpload.handleAttachmentChange,
    handlePaste: attachmentUpload.handlePaste,
    removeAttachment: attachmentUpload.removeAttachment,
    openAttachmentPicker: attachmentUpload.openAttachmentPicker,
    planModeActive: submit.planModeActive,
    deactivatePlanMode: submit.deactivatePlanMode,
    hasComposerInput: submit.hasComposerInput,
    interruptingTurn: submit.interruptingTurn,
    composerInputEnabled,
    selectedThreadId,
    selectedThreadStatus,
    selectedThreadTokenUsage,
    isThreadRunning,
    canInterruptTurn,
    canUsePrimaryAction,
    sendButtonLabel,
    slashMenuOpen: slashCommandsState.menuOpen,
    filteredSlashCommands: slashCommandsState.filteredCommands,
    selectedSlashCommandIndex: slashCommandsState.selectedIndex,
    selectSlashCommandIndex: slashCommandsState.selectIndex,
    runSlashCommand: slashActions.runSlashCommand,
    handleComposerKeydown,
    handlePrimaryAction,
    models,
    loadingModels,
    ...settings,
  };
}
