import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useAttachmentUpload } from "./useAttachmentUpload";
import { useComposerDraft } from "./useComposerDraft";
import { useComposerGoalControls } from "./useComposerGoalControls";
import { useComposerSlashActions } from "./useComposerSlashActions";
import { useComposerTurnSubmit } from "./useComposerTurnSubmit";
import { useThreadSettingsControls } from "./useThreadSettingsControls";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { latestThreadPlanItem, planItemSummary } from "@/utils/thread-plan";
import { isThreadGoalOngoing } from "@/utils/thread-goal-display";
import { useComposerSlashMenu } from "./useComposerSlashMenu";

export function useComposerController() {
  const gateway = useGatewayCatalogStore();
  const bootstrap = useGatewayBootstrapStore();
  const composer = useGatewayComposerStore();
  const navigation = useGatewayNavigationStore();
  const runtime = useGatewayThreadRuntimeStore();
  const threadView = useGatewayThreadViewStore();
  const { t } = useI18n();
  const { models, loadingModels } = storeToRefs(gateway);
  const { selectedHostId, selectedProjectId, selectedThreadId } = storeToRefs(navigation);
  const {
    selectedThreadGoal: selectedThreadGoalSnapshot,
    selectedThreadGoalObservedAt: selectedThreadGoalObservedAtSnapshot,
    selectedThreadTokenUsage,
  } = storeToRefs(composer);
  const { history } = storeToRefs(threadView);
  // Keep the app-server snapshot in Pinia for timeline/history projection, but stop treating a
  // completed Goal as composer mode. Filtering once at this boundary keeps the strip and /goal
  // actions aligned: completion returns the input to normal conversation and a new /goal starts
  // a new objective instead of editing the completed one.
  const selectedThreadGoal = computed(() =>
    isThreadGoalOngoing(selectedThreadGoalSnapshot.value) ? selectedThreadGoalSnapshot.value : null,
  );
  const selectedThreadGoalObservedAt = computed(() =>
    selectedThreadGoal.value === null ? null : selectedThreadGoalObservedAtSnapshot.value,
  );
  const selectedThreadStatus = computed(() =>
    selectedHostId.value !== null && selectedThreadId.value !== null
      ? runtime.statusFor(selectedHostId.value, selectedThreadId.value)
      : "idle",
  );

  const { turnText, attachedFiles, fileReferences, clearDraft } = useComposerDraft();
  const goalControls = useComposerGoalControls(turnText);
  const settings = useThreadSettingsControls();
  const attachmentUpload = useAttachmentUpload(selectedHostId, attachedFiles);
  const selectedRuntime = computed(() =>
    selectedHostId.value !== null && selectedThreadId.value !== null
      ? runtime.threadRuntimeProjection(selectedHostId.value, selectedThreadId.value)
      : null,
  );
  const isThreadRunning = computed(() => selectedRuntime.value?.canInterrupt === true);
  const composerInputEnabled = computed(
    () => selectedThreadId.value !== null || selectedProjectId.value !== null,
  );
  const selectedTurnOptions = () => {
    const effort =
      settings.selectedEffort.value === "default" ? undefined : settings.selectedEffort.value;
    return {
      // Only an explicit per-thread/new-thread selection may override app-server persistence.
      // Existing-thread settings are projected from thread/resume instead of inferred here.
      model: settings.selectedModel.value === "" ? undefined : settings.selectedModel.value,
      effort,
      approvalPolicy:
        settings.selectedApprovalMode.value === "custom"
          ? undefined
          : settings.selectedApprovalMode.value,
      // Provider is a thread-creation choice. Existing threads already have a provider-bound
      // session, so turn.start must not imply that the protocol can be switched in place.
      ...(selectedThreadId.value === null ? { provider: settings.selectedProvider.value } : {}),
    };
  };
  const submit = useComposerTurnSubmit({
    turnText,
    attachedFiles,
    fileReferences,
    clearDraft,
    selectedTurnOptions,
    collaborationModel: settings.collaborationModel,
    selectedEffort: settings.selectedEffort,
    fileReferencesLabel: computed(() => t("app.attachedFileReferences")),
  });
  const goalInputActive = computed(() => /^\/goal(?:\s|$)/i.test(turnText.value.trimStart()));
  const activePlanSummary = computed(() =>
    submit.planModeActive.value ? planItemSummary(latestThreadPlanItem(history.value)) : "",
  );
  const canSendTurn = computed(
    () =>
      selectedThreadId.value !== null &&
      submit.hasComposerInput.value &&
      !attachmentUpload.uploadingAttachments.value,
  );
  const canInterruptTurn = computed(
    () =>
      selectedThreadId.value !== null && isThreadRunning.value && !submit.hasComposerInput.value,
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
  const slashActions = useComposerSlashActions({
    text: turnText,
    selectedThreadId,
    startNewThread: submit.startNewThread,
    activatePlanMode: submit.activatePlanMode,
    missingGoalObjectiveMessage: computed(() => t("app.goalObjectiveRequired")),
    goalControls,
  });
  const slashCommandsState = useComposerSlashMenu({
    text: turnText,
    selectedThreadId,
    selectedThreadGoal,
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
    if (selectedThreadId.value === null) {
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

  function handleFileReferenceLimit(message: string) {
    bootstrap.setError(message, {
      hostId: selectedHostId.value,
      projectId: selectedProjectId.value,
      threadId: selectedThreadId.value,
    });
  }

  return {
    activePlanSummary,
    attachedFiles,
    fileReferences,
    goalInputActive,
    goalActionPending: goalControls.pendingAction,
    saveSelectedThreadGoal: goalControls.saveObjective,
    stopSelectedThreadGoal: goalControls.pause,
    resumeSelectedThreadGoal: goalControls.resume,
    clearSelectedThreadGoal: goalControls.clear,
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
    selectedHostId,
    selectedThreadId,
    selectedProjectId,
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
    handleFileReferenceLimit,
    models,
    loadingModels,
    ...settings,
  };
}
