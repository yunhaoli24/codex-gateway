<script setup lang="ts">
import { ShieldAlertIcon, XIcon } from "@lucide/vue";
import { Button } from "@codex-gateway/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@codex-gateway/ui/dialog";
import { computed, ref, watch } from "vue";
import { useGatewayHostMfaStore } from "@/stores/gateway-host-mfa";

const props = defineProps<{
  hostId: number | null;
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const mfaStore = useGatewayHostMfaStore();
const code = ref("");
const submitting = ref(false);

const mfaRequest = computed(() => {
  if (props.hostId === null) return undefined;
  return mfaStore.getPendingMfa(props.hostId);
});

const instructions = computed(() => {
  return mfaRequest.value?.instructions ?? "";
});

function handleSubmit() {
  if (props.hostId === null || code.value.trim() === "") return;
  submitting.value = true;
  mfaStore.submitMfa(props.hostId, code.value.trim());
  code.value = "";
  emit("update:open", false);
  // Reset submitting state after the store processes
  setTimeout(() => {
    submitting.value = false;
  }, 500);
}

function handleCancel() {
  if (props.hostId !== null) {
    mfaStore.dismissMfa(props.hostId);
  }
  code.value = "";
  emit("update:open", false);
}

function handleOpenChange(open: boolean) {
  if (!open && props.open) {
    handleCancel();
    return;
  }
  emit("update:open", open);
}

// Clear input when dialog closes
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      code.value = "";
      submitting.value = false;
    }
  },
);

// Focus the input when dialog opens
const inputRef = ref<HTMLInputElement | null>(null);
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      setTimeout(() => inputRef.value?.focus(), 100);
    }
  },
);

// If the MFA request resolves while dialog is open, close it
watch(mfaRequest, (request) => {
  if (!request && props.open) {
    emit("update:open", false);
  }
});
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <ShieldAlertIcon class="size-5 text-accent-orange" />
          {{ $t("app.hostMfaTitle") }}
        </DialogTitle>
        <DialogDescription>
          {{ $t("app.hostMfaDescription", { host: mfaRequest?.name ?? "" }) }}
        </DialogDescription>
      </DialogHeader>
      <form @submit.prevent="handleSubmit">
        <div class="space-y-4 px-6 pb-6">
          <p v-if="instructions" class="text-sm text-ink-muted">
            {{ instructions }}
          </p>

          <div class="space-y-1">
            <label for="host-mfa-code" class="text-sm font-medium text-ink">
              {{ $t("app.hostMfaCodeLabel") }}
            </label>
            <input
              id="host-mfa-code"
              ref="inputRef"
              v-model="code"
              type="text"
              class="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
              :placeholder="$t('app.hostMfaCodePlaceholder')"
              autocomplete="one-time-code"
            />
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t border-hairline px-6 py-4">
          <Button type="button" variant="ghost" size="sm" @click="handleCancel">
            {{ $t("app.cancel") }}
          </Button>
          <Button
            type="submit"
            variant="default"
            size="sm"
            :disabled="code.trim() === '' || submitting"
          >
            {{ $t("app.submit") }}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
