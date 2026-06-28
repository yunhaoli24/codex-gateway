<script setup lang="ts">
import { CheckIcon, Loader2Icon, PlusIcon, SendIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ApprovalPolicyPicker from "@/components/chat/composer/ApprovalPolicyPicker.vue";
import AttachmentChips from "@/components/chat/composer/AttachmentChips.vue";
import ContextUsageMeter from "@/components/chat/composer/ContextUsageMeter.vue";
import ModelEffortPicker from "@/components/chat/composer/ModelEffortPicker.vue";
import { useAttachmentUpload } from "@/composables/useAttachmentUpload";
import { useComposerDraft } from "@/composables/useComposerDraft";
import { useThreadSettingsControls } from "@/composables/useThreadSettingsControls";
import { useGatewayStore } from "@/stores/gateway";

const store = useGatewayStore();
const { t } = useI18n();
const {
  selectedHostId,
  selectedThreadId,
  selectedThreadStatus,
  selectedThreadTokenUsage,
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

const isThreadRunning = computed(() => selectedThreadStatus.value === "running");
const hasComposerInput = computed(() =>
  Boolean(turnText.value.trim() || attachedFiles.value.length),
);
const canSendTurn = computed(() =>
  Boolean(selectedThreadId.value && hasComposerInput.value && !uploadingAttachments.value),
);
const sendButtonLabel = computed(() => {
  if (hasComposerInput.value) return t("app.send");
  if (isThreadRunning.value) return "运行中";
  if (selectedThreadStatus.value === "completed") return "已完成";
  if (selectedThreadStatus.value === "failed") return "失败";
  if (selectedThreadStatus.value === "interrupted") return "已中断";
  return t("app.send");
});

async function sendTurn() {
  const text = turnText.value.trim();
  if (!text && !attachedFiles.value.length) return;
  const files = [...attachedFiles.value];
  const remoteFiles = files.filter((file) => !file.isImage);
  const attachedImages = files.filter((file) => file.isImage);
  const fileReferences = remoteFiles.map((file) => `- ${file.name}: ${file.path}`);
  const message = fileReferences.length
    ? `${text}${text ? "\n\n" : ""}已附加文件，远端路径：\n${fileReferences.join("\n")}`
    : text;
  clearDraft();
  await store.sendTurn(message, {
    model: activeModel.value || undefined,
    effort: selectedEffort.value === "default" ? undefined : selectedEffort.value,
    approvalPolicy:
      selectedApprovalMode.value === "custom" ? undefined : selectedApprovalMode.value,
    images: attachedImages
      .map((file) => ({ url: file.dataUrl, detail: "auto" as const }))
      .filter((image): image is { url: string; detail: "auto" } => Boolean(image.url)),
    files: remoteFiles,
  });
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== "Enter" || event.shiftKey) {
    return;
  }
  event.preventDefault();
  void sendTurn();
}
</script>

<template>
  <div
    class="shrink-0 bg-gradient-to-t from-white via-white to-white/75 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:px-[clamp(1rem,3vw,2rem)] md:pb-[clamp(0.5rem,1.4vh,1rem)]"
  >
    <div class="mx-auto w-full max-w-3xl">
      <div
        class="rounded-[1.35rem] border border-black/10 bg-white p-2 shadow-lg shadow-black/10 md:rounded-3xl md:p-[clamp(0.45rem,1vw,0.7rem)]"
      >
        <input
          ref="uploadInputRef"
          class="hidden"
          type="file"
          multiple
          @change="handleAttachmentChange"
        />
        <AttachmentChips :files="attachedFiles" @remove="removeAttachment" />
        <Textarea
          v-model="turnText"
          class="max-h-[min(28dvh,10rem)] min-h-[3.25rem] border-0 bg-transparent px-1 text-base leading-6 shadow-none ring-0 placeholder:text-base placeholder:text-[#9aa1a6] focus-visible:ring-0 md:max-h-[min(24vh,12rem)] md:min-h-[clamp(3.75rem,10vh,6rem)] md:leading-7 md:text-base"
          :placeholder="t('app.askFollowUp')"
          :disabled="!selectedThreadId"
          @keydown="handleComposerKeydown"
          @paste="handlePaste"
        />
        <div
          class="flex flex-col gap-2 pt-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        >
          <div class="flex min-w-0 items-center gap-1 overflow-x-auto text-base text-[#858b91]">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              class="text-[#858b91] hover:bg-black/[0.04] hover:text-[#4f575e]"
              :disabled="uploadingAttachments || !selectedThreadId"
              :aria-label="t('app.attachFile')"
              @click="openAttachmentPicker"
            >
              <Loader2Icon v-if="uploadingAttachments" class="size-5 animate-spin" />
              <PlusIcon v-else class="size-5" />
            </Button>
            <ApprovalPolicyPicker v-model="selectedApprovalMode" />
          </div>
          <div class="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
            <ContextUsageMeter :token-usage="selectedThreadTokenUsage" />
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
            <Button
              data-testid="send-turn-button"
              class="size-11 shrink-0 rounded-full bg-[#171b1f] p-0 hover:bg-[#171b1f]/90"
              :aria-label="sendButtonLabel"
              :disabled="!canSendTurn"
              @click="sendTurn"
            >
              <Loader2Icon v-if="uploadingAttachments" class="size-5 animate-spin" />
              <SendIcon v-else-if="hasComposerInput" class="size-5" />
              <CheckIcon v-else-if="selectedThreadStatus === 'completed'" class="size-5" />
              <SendIcon v-else class="size-5 opacity-60" />
            </Button>
          </div>
        </div>
      </div>
      <p class="mt-1 hidden text-center text-xs text-[#9aa1a6] sm:block md:mt-2">
        {{ selectedThreadId ? t("app.ctrlEnter") : t("app.selectThreadFirst") }}
      </p>
    </div>
  </div>
</template>
