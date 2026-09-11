<script setup lang="ts">
import { CheckIcon, Loader2Icon, PlusIcon, SendIcon, SquareIcon } from "@lucide/vue";
import type {
  ApprovalPolicy,
  AgentProviderId,
  AgentProviderOption,
  ModelRecord,
  ReasoningEffort,
  ThreadRuntimeStatus,
  ThreadTokenUsageState,
} from "~~/shared/types";
import { Button } from "@codex-gateway/ui/button";
import ApprovalPolicyPicker from "@/components/chat/composer/ApprovalPolicyPicker.vue";
import ContextUsageMeter from "@/components/chat/composer/ContextUsageMeter.vue";
import ModelEffortPicker from "@/components/chat/composer/ModelEffortPicker.vue";

defineProps<{
  uploadingAttachments: boolean;
  selectedThreadId: string | null;
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
  attach: [];
  primaryAction: [];
  selectModel: [model: string];
  selectEffort: [effort: ReasoningEffort];
  selectProvider: [provider: AgentProviderId];
  updateSelectedApprovalMode: [mode: ApprovalPolicy | "custom"];
}>();
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5 pt-1.5 sm:flex-wrap sm:justify-between sm:gap-2">
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
      <div class="composer-approval-control">
        <ApprovalPolicyPicker
          :model-value="selectedApprovalMode"
          @update:model-value="emit('updateSelectedApprovalMode', $event)"
        />
      </div>
    </div>
    <div class="ml-auto flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
      <ContextUsageMeter :token-usage="selectedThreadTokenUsage" />
      <ModelEffortPicker
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
        :selected-provider="selectedProvider"
        :provider-options="providerOptions"
        :can-select-provider="canSelectProvider"
        @select-model="emit('selectModel', $event)"
        @select-effort="emit('selectEffort', $event)"
        @select-provider="emit('selectProvider', $event)"
      />
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

<style scoped>
.composer-approval-control {
  display: none;
}

/* Dockview can make the composer narrow while the browser viewport remains desktop-sized. Query
   the control surface itself so approval yields to model, effort, context, and send controls. */
@container (min-width: 44rem) {
  .composer-approval-control {
    display: block;
  }
}
</style>
