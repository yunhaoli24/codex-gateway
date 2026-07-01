<script setup lang="ts">
import { ClipboardPasteIcon, RefreshCwIcon } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import ConfigJsonEditor from "@/components/settings/ConfigJsonEditor.vue";
import { useGatewayStore } from "@/stores/gateway";
import { errorMessageLabels, messageFromError } from "@/stores/gateway/thread-utils/identity";

const emit = defineEmits<{ close: [] }>();
const store = useGatewayStore();
const { t } = useI18n();
const errorLabels = computed(() => errorMessageLabels(t));
const configText = ref(store.exportConfigText());
const configError = ref("");

onMounted(refreshConfig);

function refreshConfig() {
  configError.value = "";
  configText.value = store.exportConfigText();
}

async function importConfig() {
  configError.value = "";
  try {
    await store.importConfigText(configText.value);
    emit("close");
  } catch (error: any) {
    configError.value = messageFromError(error, t("app.importConfigFailed"), errorLabels.value);
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
    <div class="shrink-0 text-sm text-ink-secondary">{{ t("app.configJsonPlaceholder") }}</div>
    <ConfigJsonEditor v-model="configText" :placeholder="t('app.configJsonPlaceholder')" />
    <div
      v-if="configError"
      class="shrink-0 whitespace-pre-line rounded-md bg-destructive/10 p-3 text-sm text-destructive"
    >
      {{ configError }}
    </div>
    <div class="flex shrink-0 justify-end gap-2">
      <Button variant="secondary" @click="refreshConfig">
        <RefreshCwIcon class="size-4" />
        {{ t("app.refreshConfig") }}
      </Button>
      <Button :disabled="!configText.trim()" @click="importConfig">
        <ClipboardPasteIcon class="size-4" />
        {{ t("app.importConfig") }}
      </Button>
    </div>
  </div>
</template>
