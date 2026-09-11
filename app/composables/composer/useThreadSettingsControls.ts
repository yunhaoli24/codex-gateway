import { computed, ref, watch } from "vue";

import { storeToRefs } from "pinia";
import {
  agentProviderOptions,
  type AgentProviderId,
  type ApprovalPolicy,
  type ReasoningEffort,
} from "~~/shared/types";
import { firstNonEmptyString, trimmedOrFallback, trimmedOrNull } from "~~/shared/utils/strings";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayProjectDefaultsStore } from "@/stores/gateway-project-defaults";

export function useThreadSettingsControls() {
  const gateway = useGatewayCatalogStore();
  const composer = useGatewayComposerStore();
  const navigation = useGatewayNavigationStore();
  const projectDefaultsStore = useGatewayProjectDefaultsStore();
  const { models, defaultModel } = storeToRefs(gateway);
  const { selectedThreadSettings } = storeToRefs(composer);
  const { selectedHostId, selectedProjectId, selectedThreadId } = storeToRefs(navigation);
  const newThreadModel = ref("");
  const newThreadEffort = ref<ReasoningEffort>("default");
  const newThreadApprovalMode = ref<ApprovalPolicy | "custom">("custom");
  const selectedProvider = ref<AgentProviderId>("codex");

  const projectDefaults = computed(() => {
    if (selectedHostId.value === null || selectedProjectId.value === null) return null;
    return projectDefaultsStore.defaultsFor(
      selectedHostId.value,
      selectedProjectId.value,
      selectedProvider.value,
    );
  });
  const newThreadProjectDefaults = computed(() =>
    selectedThreadId.value === null ? projectDefaults.value : null,
  );

  watch(
    [selectedHostId, selectedProjectId, selectedProvider],
    ([hostId, projectId, provider]) => {
      if (hostId === null || projectId === null) return;
      void projectDefaultsStore.ensure(hostId, projectId, provider).catch((error: unknown) => {
        console.warn("[gateway] failed to resolve remote project defaults", error);
      });
    },
    { immediate: true },
  );

  // Existing-thread controls are computed proxies over the per-thread Pinia state. Do not mirror
  // them into local refs with bidirectional watchers: thread selection, snapshot hydration, and the
  // model catalog arrive independently, and a transient model default can otherwise be written
  // back as the thread's setting. Local refs are retained only for the pre-thread composer, where
  // no app-server thread identity exists yet.
  const selectedModel = computed({
    // An empty new-thread model is the remote-default state: thread.start omits model and effort.
    // The concrete label comes from config/read, but displaying that value must never turn it into
    // a Gateway override because Codex may resolve a changed config by the time creation runs.
    get: () =>
      selectedThreadId.value === null
        ? newThreadModel.value
        : (trimmedOrNull(selectedThreadSettings.value.model) ?? ""),
    set: (model: string) => {
      if (selectedThreadId.value === null) {
        newThreadModel.value = model;
        return;
      }
      void composer.saveSelectedThreadSettings({ model: trimmedOrNull(model) });
    },
  });
  const selectedEffort = computed<ReasoningEffort>({
    get: () =>
      selectedThreadId.value === null
        ? newThreadEffort.value
        : (selectedThreadSettings.value.effort ?? "default"),
    set: (effort) => {
      if (selectedThreadId.value === null) {
        newThreadEffort.value = effort;
        return;
      }
      void composer.saveSelectedThreadSettings({ effort: effort === "default" ? null : effort });
    },
  });
  const selectedApprovalMode = computed<ApprovalPolicy | "custom">({
    get: () =>
      selectedThreadId.value === null
        ? newThreadApprovalMode.value
        : (selectedThreadSettings.value.approvalPolicy ?? "custom"),
    set: (approvalPolicy) => {
      if (selectedThreadId.value === null) {
        newThreadApprovalMode.value = approvalPolicy;
        return;
      }
      void composer.saveSelectedThreadSettings({
        approvalPolicy: approvalPolicy === "custom" ? null : approvalPolicy,
      });
    },
  });

  const activeModel = computed(() => selectedModel.value);
  // Plan is an explicit app-server setting update, so it needs a concrete model even during the
  // short interval before an existing thread's settings notification arrives. Keep this effective
  // value separate from activeModel: using the catalog default here must not make the model picker
  // claim that the resumed thread already selected that model.
  const collaborationModel = computed(
    () =>
      firstNonEmptyString([
        selectedThreadSettings.value.collaborationMode?.settings.model,
        selectedModel.value,
        newThreadProjectDefaults.value?.model,
        defaultModel.value?.model,
        defaultModel.value?.id,
      ]) ?? "",
  );
  const activeModelRecord = computed(() => {
    const match = models.value.find(
      (candidate) => candidate.model === activeModel.value || candidate.id === activeModel.value,
    );
    // config/read supplies the actual model selected by the remote config layers. models/list is
    // used only to enrich that concrete id with display metadata and supported effort choices.
    if (match !== undefined) return match;
    if (activeModel.value !== "") return null;
    const remoteModel = newThreadProjectDefaults.value?.model;
    return (
      models.value.find(
        (candidate) => candidate.model === remoteModel || candidate.id === remoteModel,
      ) ?? null
    );
  });
  const activeModelLabel = computed(() => {
    // The remote-default state has no local override label. The picker renders the concrete
    // config/read value separately, so it remains visually distinct from an explicit selection.
    if (activeModel.value === "") return "";
    const model = activeModelRecord.value;
    return firstNonEmptyString([model?.displayName, model?.model, activeModel.value]) ?? "";
  });
  const hostDefaultModelLabel = computed(() => {
    const model = activeModelRecord.value;
    return (
      firstNonEmptyString([
        model?.displayName,
        model?.model,
        newThreadProjectDefaults.value?.model,
      ]) ?? ""
    );
  });
  // activeEffortValue is the picker's selection state: empty means "follow the host default" and
  // no override is sent. The effective effort (model-level default) is display-only and resolved
  // separately for the compact trigger label.
  const activeEffortValue = computed(() =>
    selectedEffort.value === "default" ? "" : selectedEffort.value,
  );
  const hostDefaultEffortLabel = computed(() =>
    compactEffortLabel(
      newThreadProjectDefaults.value?.effort ??
        activeModelRecord.value?.defaultReasoningEffort ??
        "",
    ),
  );
  const activeEffortCompactLabel = computed(() => {
    if (selectedEffort.value === "default") return hostDefaultEffortLabel.value;
    return compactEffortLabel(selectedEffort.value);
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

  function compactEffortLabel(value: string) {
    if (value === "") return "";
    const normalized = value.toLowerCase().replaceAll("_", "-");
    const knownLabels: Record<string, string> = {
      low: "Light",
      light: "Light",
      medium: "Medium",
      high: "High",
      "extra-high": "Extra High",
      xhigh: "Extra High",
    };
    const knownLabel = knownLabels[normalized];
    if (knownLabel !== undefined) return knownLabel;
    return value
      .split(/[-_\s]+/)
      .filter((part) => part !== "")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function labelEffortOption(option: { value: ReasoningEffort; label?: string }) {
    return compactEffortLabel(trimmedOrFallback(option.label, option.value));
  }

  function modelOptionValue(modelOption: { model?: string; id: string }) {
    return trimmedOrFallback(modelOption.model, modelOption.id);
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

  // Provider is selected before a thread/turn is sent and is deliberately not stored as a model
  // setting. The current registry has one provider, but keeping this session-level control separate
  // means adding another adapter will not require changing model or reasoning-effort semantics.
  function setSelectedProvider(value: AgentProviderId) {
    selectedProvider.value = value;
  }

  return {
    selectedModel,
    selectedEffort,
    selectedApprovalMode,
    activeModel,
    collaborationModel,
    activeModelLabel,
    hostDefaultModelLabel,
    hostDefaultEffortLabel,
    activeEffortValue,
    activeEffortCompactLabel,
    effortOptions,
    labelEffortOption,
    modelOptionValue,
    setSelectedModel,
    setSelectedEffort,
    setSelectedApprovalMode,
    selectedProvider,
    providerOptions: agentProviderOptions,
    setSelectedProvider,
  };
}
