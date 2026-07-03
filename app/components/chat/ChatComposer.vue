<script setup lang="ts">
import { CheckIcon, Loader2Icon, PlusIcon, SendIcon, SquareIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ApprovalPolicyPicker from "@/components/chat/composer/ApprovalPolicyPicker.vue";
import AttachmentChips from "@/components/chat/composer/AttachmentChips.vue";
import ComposerModeStrip from "@/components/chat/composer/ComposerModeStrip.vue";
import ContextUsageMeter from "@/components/chat/composer/ContextUsageMeter.vue";
import ModelEffortPicker from "@/components/chat/composer/ModelEffortPicker.vue";
import SlashCommandMenu from "@/components/chat/composer/SlashCommandMenu.vue";
import { useAttachmentUpload } from "@/composables/useAttachmentUpload";
import { useComposerDraft } from "@/composables/useComposerDraft";
import { useComposerSlashActions } from "@/composables/useComposerSlashActions";
import { useComposerTurnSubmit } from "@/composables/useComposerTurnSubmit";
import { useSlashCommands, type SlashCommand } from "@/composables/useSlashCommands";
import { useThreadSettingsControls } from "@/composables/useThreadSettingsControls";
import { useGatewayStore } from "@/stores/gateway";
import { latestThreadPlanItem, planItemSummary } from "@/utils/thread-plan";

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
const {
  selectedApprovalMode,
  selectedEffort,
  activeModel,
  activeModelLabel,
  activeEffortValue,
  activeEffortCompactLabel,
  effortOptions,
  labelEffortOption,
  modelOptionValue,
  setSelectedModel,
  setSelectedEffort,
} = useThreadSettingsControls();
const {
  uploadInputRef,
  uploadingAttachments,
  openAttachmentPicker,
  handleAttachmentChange,
  handlePaste,
  removeAttachment,
} = useAttachmentUpload(selectedHostId, attachedFiles);

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
  const effort = selectedEffort.value === "default" ? undefined : selectedEffort.value;
  return {
    model: activeModel.value || undefined,
    effort,
    approvalPolicy:
      selectedApprovalMode.value === "custom" ? undefined : selectedApprovalMode.value,
  };
};
const {
  planModeActive,
  hasComposerInput,
  interruptingTurn,
  activatePlanMode,
  deactivatePlanMode,
  startNewThread,
  submitTurn,
  interruptTurn,
} = useComposerTurnSubmit({
  turnText,
  attachedFiles,
  clearDraft,
  selectedTurnOptions,
  activeModel,
  selectedEffort,
  fileReferencesLabel: computed(() => t("app.attachedFileReferences")),
});
const goalInputActive = computed(() => /^\/goal(?:\s|$)/i.test(turnText.value.trimStart()));
const activePlanSummary = computed(() =>
  planModeActive.value ? planItemSummary(latestThreadPlanItem(history.value)) : "",
);
const canSendTurn = computed(() =>
  Boolean(selectedThreadId.value && hasComposerInput.value && !uploadingAttachments.value),
);
const canInterruptTurn = computed(() =>
  Boolean(selectedThreadId.value && isThreadRunning.value && !hasComposerInput.value),
);
const canUsePrimaryAction = computed(() =>
  Boolean((canSendTurn.value || canInterruptTurn.value) && !uploadingAttachments.value),
);
const sendButtonLabel = computed(() => {
  if (hasComposerInput.value) return t("app.send");
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

const { runSlashCommand, executeInlineSlashCommand } = useComposerSlashActions({
  text: turnText,
  selectedThreadId,
  startNewThread,
  activatePlanMode,
  missingGoalObjectiveMessage: computed(() => t("app.goalObjectiveRequired")),
});

const slashCommandsState = useSlashCommands({
  text: turnText,
  commands: slashCommands,
  enabled: composerInputEnabled,
  onSelect: runSlashCommand,
});
const {
  menuOpen: slashMenuOpen,
  filteredCommands: filteredSlashCommands,
  selectedIndex: selectedSlashCommandIndex,
  selectIndex: selectSlashCommandIndex,
} = slashCommandsState;

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
    void interruptTurn();
    return;
  }
  void submitComposer();
}

async function submitComposer() {
  if (await executeInlineSlashCommand()) {
    slashCommandsState.dismiss();
    return;
  }
  await submitTurn();
}
</script>

<template>
  <div
    class="shrink-0 bg-gradient-to-t from-surface via-surface to-surface/75 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:px-[clamp(1rem,3vw,2rem)] md:pb-[clamp(0.5rem,1.4vh,1rem)]"
  >
    <div class="mx-auto w-full max-w-3xl">
      <div
        class="relative rounded-[1.35rem] border border-hairline bg-surface p-2 shadow-lg shadow-ink/10 md:rounded-3xl md:p-[clamp(0.45rem,1vw,0.7rem)]"
      >
        <SlashCommandMenu
          :open="slashMenuOpen"
          :commands="filteredSlashCommands"
          :selected-index="selectedSlashCommandIndex"
          @hover="selectSlashCommandIndex"
          @select="runSlashCommand"
        />
        <input
          ref="uploadInputRef"
          class="hidden"
          type="file"
          multiple
          @change="handleAttachmentChange"
        />
        <ComposerModeStrip
          :plan-mode-active="planModeActive"
          :plan-summary="activePlanSummary"
          :goal-input-active="goalInputActive"
          :goal="selectedThreadGoal"
          :goal-observed-at="selectedThreadGoalObservedAt"
          @deactivate-plan="deactivatePlanMode"
        />
        <AttachmentChips :files="attachedFiles" @remove="removeAttachment" />
        <Textarea
          v-model="turnText"
          class="max-h-[min(28dvh,10rem)] min-h-[3.25rem] border-0 bg-transparent px-1 text-base leading-6 shadow-none ring-0 placeholder:text-base placeholder:text-ink-faint focus-visible:ring-0 md:max-h-[min(24vh,12rem)] md:min-h-[clamp(3.75rem,10vh,6rem)] md:leading-7 md:text-base"
          :placeholder="t('app.askFollowUp')"
          :disabled="!composerInputEnabled"
          @keydown="handleComposerKeydown"
          @paste="handlePaste"
        />
        <div
          class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 pt-1.5 sm:flex sm:flex-row sm:flex-wrap sm:justify-between sm:gap-2"
        >
          <div class="flex min-w-0 items-center gap-1 text-base text-ink-muted">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              class="text-ink-muted hover:bg-canvas-soft hover:text-ink-secondary"
              :disabled="uploadingAttachments || !selectedThreadId"
              :aria-label="t('app.attachFile')"
              @click="openAttachmentPicker"
            >
              <Loader2Icon v-if="uploadingAttachments" class="size-5 animate-spin" />
              <PlusIcon v-else class="size-5" />
            </Button>
            <ApprovalPolicyPicker v-model="selectedApprovalMode" />
          </div>
          <div class="contents sm:flex sm:min-w-0 sm:items-center sm:justify-end sm:gap-2">
            <ContextUsageMeter :token-usage="selectedThreadTokenUsage" />
            <div class="min-w-0 justify-self-center sm:contents">
              <ModelEffortPicker
                :models="models"
                :loading-models="loadingModels"
                :active-model="activeModel"
                :active-model-label="activeModelLabel"
                :active-effort-value="activeEffortValue"
                :active-effort-compact-label="activeEffortCompactLabel"
                :effort-options="effortOptions"
                :label-effort-option="labelEffortOption"
                :model-option-value="modelOptionValue"
                @select-model="setSelectedModel"
                @select-effort="setSelectedEffort"
              />
            </div>
            <Button
              data-testid="send-turn-button"
              class="size-11 shrink-0 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary-active"
              :aria-label="sendButtonLabel"
              :disabled="!canUsePrimaryAction || interruptingTurn"
              @click="handlePrimaryAction"
            >
              <Loader2Icon v-if="uploadingAttachments" class="size-5 animate-spin" />
              <Loader2Icon
                v-else-if="interruptingTurn || (isThreadRunning && hasComposerInput)"
                class="size-5 animate-spin"
              />
              <SendIcon v-else-if="hasComposerInput" class="size-5" />
              <SquareIcon v-else-if="canInterruptTurn" class="size-5 fill-current" />
              <CheckIcon v-else-if="selectedThreadStatus === 'completed'" class="size-5" />
              <SendIcon v-else class="size-5 opacity-60" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
