import { computed, nextTick, ref, watch } from "vue";

import { storeToRefs } from "pinia";
import type { ApprovalPolicy, ReasoningEffort } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";

export function useThreadSettingsControls() {
  const gateway = useGatewayStore();
  const composer = useGatewayComposerStore();
  const navigation = useGatewayNavigationStore();
  const { models, defaultModel } = storeToRefs(gateway);
  const { selectedThreadSettings } = storeToRefs(composer);
  const { selectedThreadId } = storeToRefs(navigation);
  const { t } = useI18n();
  const selectedModel = ref("");
  const selectedEffort = ref<ReasoningEffort>("default");
  const selectedApprovalMode = ref<ApprovalPolicy | "custom">("custom");
  let syncingSettings = false;

  const activeModel = computed(
    () => selectedModel.value || defaultModel.value?.model || defaultModel.value?.id || "",
  );
  const activeModelRecord = computed(() =>
    models.value.find(
      (candidate) => candidate.model === activeModel.value || candidate.id === activeModel.value,
    ),
  );
  const activeModelLabel = computed(() => {
    const model = activeModelRecord.value;
    return model?.displayName || model?.model || activeModel.value || "模型";
  });
  const activeEffortValue = computed(() => {
    return selectedEffort.value !== "default"
      ? selectedEffort.value
      : activeModelRecord.value?.defaultReasoningEffort || "";
  });
  const effortOptions = computed(() => {
    const supportedEfforts = activeModelRecord.value?.supportedReasoningEfforts ?? [];
    const options = supportedEfforts.map((option) => ({
      value: option.reasoningEffort,
      label: option.reasoningEffort,
    }));
    if (
      selectedEffort.value !== "default" &&
      !options.some((option) => option.value === selectedEffort.value)
    ) {
      options.unshift({ value: selectedEffort.value, label: selectedEffort.value });
    }
    return options;
  });
  const activeEffortLabel = computed(() =>
    labelEffortOption(effortOptions.value.find((option) => option.value === selectedEffort.value)),
  );
  const activeEffortCompactLabel = computed(() => compactEffortLabel(activeEffortValue.value));

  function compactEffortLabel(value: string) {
    if (!value) return "";
    const normalized = value.toLowerCase().replaceAll("_", "-");
    const knownLabels: Record<string, string> = {
      low: "Light",
      light: "Light",
      medium: "Medium",
      high: "High",
      "extra-high": "Extra High",
      xhigh: "Extra High",
    };
    if (knownLabels[normalized]) {
      return knownLabels[normalized];
    }
    return value
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function labelEffortOption(option: { value: ReasoningEffort; label?: string } | undefined) {
    if (!option) return activeEffortCompactLabel.value || t("app.reasoningDefault");
    return compactEffortLabel(option.label || option.value);
  }

  function modelOptionValue(modelOption: { model?: string; id: string }) {
    return modelOption.model || modelOption.id;
  }

  function setSelectedModel(model: string) {
    selectedModel.value = model;
  }

  function setSelectedEffort(effort: ReasoningEffort) {
    selectedEffort.value = effort;
  }

  function setSelectedApprovalMode(value: ApprovalPolicy | "custom") {
    selectedApprovalMode.value = value;
  }

  function syncComposerFromThreadSettings() {
    syncingSettings = true;
    selectedModel.value =
      selectedThreadSettings.value.model ||
      defaultModel.value?.model ||
      defaultModel.value?.id ||
      "";
    selectedEffort.value = selectedThreadSettings.value.effort || "default";
    selectedApprovalMode.value = selectedThreadSettings.value.approvalPolicy || "custom";
    void nextTick(() => {
      syncingSettings = false;
    });
  }

  watch(
    () => [
      selectedThreadId.value,
      selectedThreadSettings.value.model,
      selectedThreadSettings.value.effort,
      selectedThreadSettings.value.approvalPolicy,
      defaultModel.value?.model,
      defaultModel.value?.id,
    ],
    syncComposerFromThreadSettings,
    { immediate: true },
  );

  watch(selectedModel, (model) => {
    if (syncingSettings || !selectedThreadId.value) {
      return;
    }
    void composer.saveSelectedThreadSettings({ model: model || null });
  });

  watch(selectedEffort, (effort) => {
    if (syncingSettings || !selectedThreadId.value) {
      return;
    }
    void composer.saveSelectedThreadSettings({ effort: effort === "default" ? null : effort });
  });

  watch(selectedApprovalMode, (approvalPolicy) => {
    if (syncingSettings || !selectedThreadId.value) {
      return;
    }
    void composer.saveSelectedThreadSettings({
      approvalPolicy: approvalPolicy === "custom" ? null : approvalPolicy,
    });
  });

  return {
    selectedModel,
    selectedEffort,
    selectedApprovalMode,
    activeModel,
    activeModelLabel,
    activeEffortValue,
    activeEffortLabel,
    activeEffortCompactLabel,
    effortOptions,
    labelEffortOption,
    modelOptionValue,
    setSelectedModel,
    setSelectedEffort,
    setSelectedApprovalMode,
  };
}
