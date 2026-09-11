<script setup lang="ts">
import { ref } from "vue";
import type {
  ApprovalPolicy,
  AgentProviderId,
  AgentProviderOption,
  ModelRecord,
  ReasoningEffort,
  ThreadGoal,
  ThreadRuntimeStatus,
  ThreadTokenUsageState,
} from "~~/shared/types";
import type { ComposerAttachment } from "@/composables/composer/useComposerDraft";
import type { ComposerFileReference } from "@/stores/gateway/types";
import type { ComposerGoalPendingAction } from "@/composables/composer/useComposerGoalControls";
import type { SlashMenuItem } from "@/composables/composer/useSlashCommands";
import AttachmentChips from "@/components/chat/composer/AttachmentChips.vue";
import ComposerModeStrip from "@/components/chat/composer/ComposerModeStrip.vue";
import ComposerToolbar from "@/components/chat/composer/ComposerToolbar.vue";
import SlashCommandMenu from "@/components/chat/composer/SlashCommandMenu.vue";
import ComposerEditor from "@/components/chat/composer/ComposerEditor.vue";

const props = defineProps<{
  modelValue: string;
  fileReferences: ComposerFileReference[];
  attachedFiles: ComposerAttachment[];
  planModeActive: boolean;
  planSummary: string;
  goalInputActive: boolean;
  goal: ThreadGoal | null;
  goalObservedAt: number | null;
  goalActionPending: ComposerGoalPendingAction | null;
  slashMenuOpen: boolean;
  filteredSlashCommands: SlashMenuItem[];
  selectedSlashCommandIndex: number;
  composerInputEnabled: boolean;
  uploadingAttachments: boolean;
  selectedThreadId: string | null;
  selectedHostId: number | null;
  selectedProjectId: number | null;
  selectedApprovalMode: ApprovalPolicy | "custom";
  selectedProvider: AgentProviderId;
  providerOptions: readonly AgentProviderOption[];
  canSelectProvider: boolean;
  selectedThreadTokenUsage: ThreadTokenUsageState | null;
  models: ModelRecord[];
  loadingModels: boolean;
  activeModel: string;
  activeModelLabel: string;
  hostDefaultModelLabel: string;
  hostDefaultEffortLabel: string;
  activeEffortValue: string;
  activeEffortCompactLabel: string;
  effortOptions: Array<{ value: ReasoningEffort; label?: string }>;
  labelEffortOption: (option: { value: ReasoningEffort; label?: string }) => string;
  modelOptionValue: (modelOption: { model?: string; id: string }) => string;
  hasComposerInput: boolean;
  isThreadRunning: boolean;
  canInterruptTurn: boolean;
  canUsePrimaryAction: boolean;
  interruptingTurn: boolean;
  selectedThreadStatus: ThreadRuntimeStatus;
  sendButtonLabel: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:fileReferences": [value: ComposerFileReference[]];
  deactivatePlan: [];
  saveGoal: [objective: string];
  stopGoal: [];
  resumeGoal: [];
  clearGoal: [];
  hoverSlashCommand: [index: number];
  selectSlashCommand: [command: SlashMenuItem];
  attachmentChange: [event: Event];
  paste: [event: ClipboardEvent];
  removeAttachment: [id: string];
  keydown: [event: KeyboardEvent];
  fileReferenceLimit: [message: string];
  primaryAction: [];
  updateSelectedApprovalMode: [mode: ApprovalPolicy | "custom"];
  selectModel: [model: string];
  selectEffort: [effort: ReasoningEffort];
  selectProvider: [provider: AgentProviderId];
}>();

const uploadInput = ref<HTMLInputElement | null>(null);

function openAttachmentPicker() {
  uploadInput.value?.click();
}

function composerScopeKey() {
  return `${props.selectedProjectId ?? "none"}:${props.selectedThreadId ?? "new"}`;
}

function updateModelValue(value: string, sourceScopeKey: string) {
  if (sourceScopeKey === composerScopeKey()) emit("update:modelValue", value);
}

function updateFileReferences(value: ComposerFileReference[], sourceScopeKey: string) {
  if (sourceScopeKey === composerScopeKey()) emit("update:fileReferences", value);
}
</script>

<template>
  <div
    class="shrink-0 bg-gradient-to-t from-surface via-surface to-surface/75 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:px-[clamp(1rem,3vw,2rem)] md:pb-[clamp(0.5rem,1.4vh,1rem)]"
  >
    <div class="mx-auto w-full max-w-3xl">
      <ComposerModeStrip
        :plan-mode-active="planModeActive"
        :plan-summary="planSummary"
        :goal-input-active="goalInputActive"
        :goal="goal"
        :goal-observed-at="goalObservedAt"
        :goal-action-pending="goalActionPending"
        @deactivate-plan="emit('deactivatePlan')"
        @save-goal="emit('saveGoal', $event)"
        @stop-goal="emit('stopGoal')"
        @resume-goal="emit('resumeGoal')"
        @clear-goal="emit('clearGoal')"
      />
      <div
        class="relative rounded-[1.35rem] border border-hairline bg-surface p-2 shadow-lg shadow-ink/10 md:rounded-3xl md:p-[clamp(0.45rem,1vw,0.7rem)]"
      >
        <SlashCommandMenu
          :open="slashMenuOpen"
          :commands="filteredSlashCommands"
          :selected-index="selectedSlashCommandIndex"
          @hover="emit('hoverSlashCommand', $event)"
          @select="emit('selectSlashCommand', $event)"
        />
        <input
          ref="uploadInput"
          class="hidden"
          type="file"
          multiple
          @change="emit('attachmentChange', $event)"
        />
        <AttachmentChips :files="attachedFiles" @remove="emit('removeAttachment', $event)" />
        <ComposerEditor
          :key="composerScopeKey()"
          :model-value="modelValue"
          :references="fileReferences"
          :scope-key="composerScopeKey()"
          :host-id="selectedHostId"
          :project-id="selectedProjectId"
          :disabled="!composerInputEnabled"
          :placeholder="$t('app.askFollowUp')"
          :limit-message="$t('app.fileReferenceLimit', { count: 10 })"
          @update:model-value="updateModelValue"
          @update:references="updateFileReferences"
          @keydown="emit('keydown', $event)"
          @paste="emit('paste', $event)"
          @limit="emit('fileReferenceLimit', $event)"
        />
        <ComposerToolbar
          :uploading-attachments="uploadingAttachments"
          :selected-thread-id="selectedThreadId"
          :selected-approval-mode="selectedApprovalMode"
          :selected-provider="selectedProvider"
          :provider-options="providerOptions"
          :can-select-provider="canSelectProvider"
          :selected-thread-token-usage="selectedThreadTokenUsage"
          :models="models"
          :loading-models="loadingModels"
          :active-model="activeModel"
          :active-model-label="activeModelLabel"
          :host-default-model-label="hostDefaultModelLabel"
          :host-default-effort-label="hostDefaultEffortLabel"
          :active-effort-value="activeEffortValue"
          :active-effort-compact-label="activeEffortCompactLabel"
          :effort-options="effortOptions"
          :label-effort-option="labelEffortOption"
          :model-option-value="modelOptionValue"
          :has-composer-input="hasComposerInput"
          :is-thread-running="isThreadRunning"
          :can-interrupt-turn="canInterruptTurn"
          :can-use-primary-action="canUsePrimaryAction"
          :interrupting-turn="interruptingTurn"
          :selected-thread-status="selectedThreadStatus"
          :send-button-label="sendButtonLabel"
          @attach="openAttachmentPicker"
          @primary-action="emit('primaryAction')"
          @update-selected-approval-mode="emit('updateSelectedApprovalMode', $event)"
          @select-model="emit('selectModel', $event)"
          @select-effort="emit('selectEffort', $event)"
          @select-provider="emit('selectProvider', $event)"
        />
      </div>
    </div>
  </div>
</template>
