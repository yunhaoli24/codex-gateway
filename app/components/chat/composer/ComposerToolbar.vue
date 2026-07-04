<script setup lang="ts">
import { CheckIcon, Loader2Icon, PlusIcon, SendIcon, SquareIcon } from "@lucide/vue";
import type {
  ApprovalPolicy,
  ModelRecord,
  ReasoningEffort,
  ThreadRuntimeStatus,
  ThreadTokenUsageState,
} from "~~/shared/types";
import { Button } from "@/components/ui/button";
import ApprovalPolicyPicker from "@/components/chat/composer/ApprovalPolicyPicker.vue";
import ContextUsageMeter from "@/components/chat/composer/ContextUsageMeter.vue";
import ModelEffortPicker from "@/components/chat/composer/ModelEffortPicker.vue";

defineProps<{
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
  attach: [];
  primaryAction: [];
  selectModel: [model: string];
  selectEffort: [effort: ReasoningEffort];
  updateSelectedApprovalMode: [mode: ApprovalPolicy | "custom"];
}>();
</script>

<template>
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
        :aria-label="$t('app.attachFile')"
        @click="emit('attach')"
      >
        <Loader2Icon v-if="uploadingAttachments" class="size-5 animate-spin" />
        <PlusIcon v-else class="size-5" />
      </Button>
      <ApprovalPolicyPicker
        :model-value="selectedApprovalMode"
        @update:model-value="emit('updateSelectedApprovalMode', $event)"
      />
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
          @select-model="emit('selectModel', $event)"
          @select-effort="emit('selectEffort', $event)"
        />
      </div>
      <Button
        data-testid="send-turn-button"
        class="size-11 shrink-0 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary-active"
        :aria-label="sendButtonLabel"
        :disabled="!canUsePrimaryAction || interruptingTurn"
        @click="emit('primaryAction')"
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
</template>
