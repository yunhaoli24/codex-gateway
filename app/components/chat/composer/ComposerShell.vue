<script setup lang="ts">
import { ref } from "vue";
import type {
  ApprovalPolicy,
  ModelRecord,
  ReasoningEffort,
  ThreadGoal,
  ThreadRuntimeStatus,
  ThreadTokenUsageState,
} from "~~/shared/types";
import type { ComposerAttachment } from "@/composables/composer/useComposerDraft";
import type { SlashMenuItem } from "@/composables/composer/useSlashCommands";
import AttachmentChips from "@/components/chat/composer/AttachmentChips.vue";
import ComposerModeStrip from "@/components/chat/composer/ComposerModeStrip.vue";
import ComposerToolbar from "@/components/chat/composer/ComposerToolbar.vue";
import SlashCommandMenu from "@/components/chat/composer/SlashCommandMenu.vue";
import { Textarea } from "@/components/ui/textarea";

defineProps<{
  modelValue: string;
  attachedFiles: ComposerAttachment[];
  planModeActive: boolean;
  planSummary: string;
  goalInputActive: boolean;
  goal: ThreadGoal | null;
  goalObservedAt: number | null;
  slashMenuOpen: boolean;
  filteredSlashCommands: SlashMenuItem[];
  selectedSlashCommandIndex: number;
  composerInputEnabled: boolean;
  uploadingAttachments: boolean;
  selectedThreadId: string | null;
  selectedApprovalMode: ApprovalPolicy | "custom";
  selectedThreadTokenUsage: ThreadTokenUsageState | null;
  models: ModelRecord[];
  loadingModels: boolean;
  activeModel: string;
  activeModelLabel: string;
  activeEffortValue: string;
  activeEffortCompactLabel: string;
  effortOptions: Array<{ value: ReasoningEffort; label?: string }>;
  labelEffortOption: (option: { value: ReasoningEffort; label?: string } | undefined) => string;
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
  deactivatePlan: [];
  hoverSlashCommand: [index: number];
  selectSlashCommand: [command: SlashMenuItem];
  attachmentChange: [event: Event];
  paste: [event: ClipboardEvent];
  removeAttachment: [id: string];
  keydown: [event: KeyboardEvent];
  primaryAction: [];
  updateSelectedApprovalMode: [mode: ApprovalPolicy | "custom"];
  selectModel: [model: string];
  selectEffort: [effort: ReasoningEffort];
}>();

const uploadInput = ref<HTMLInputElement | null>(null);

function openAttachmentPicker() {
  uploadInput.value?.click();
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
        @deactivate-plan="emit('deactivatePlan')"
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
        <Textarea
          :model-value="modelValue"
          class="max-h-[min(28dvh,10rem)] min-h-[3.25rem] border-0 bg-transparent px-1 text-base leading-6 shadow-none ring-0 placeholder:text-base placeholder:text-ink-faint focus-visible:ring-0 md:max-h-[min(24vh,12rem)] md:min-h-[clamp(3.75rem,10vh,6rem)] md:leading-7 md:text-base"
          :placeholder="$t('app.askFollowUp')"
          :disabled="!composerInputEnabled"
          @update:model-value="emit('update:modelValue', String($event))"
          @keydown="emit('keydown', $event)"
          @paste="emit('paste', $event)"
        />
        <ComposerToolbar
          :uploading-attachments="uploadingAttachments"
          :selected-thread-id="selectedThreadId"
          :selected-approval-mode="selectedApprovalMode"
          :selected-thread-token-usage="selectedThreadTokenUsage"
          :models="models"
          :loading-models="loadingModels"
          :active-model="activeModel"
          :active-model-label="activeModelLabel"
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
        />
      </div>
    </div>
  </div>
</template>
