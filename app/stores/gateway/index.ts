import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  GatewayConfig,
  HostRecord,
  ModelRecord,
  ProjectDirectoryAvailability,
  ProjectRecord,
} from "~~/shared/types";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { defaultGatewayConfig } from "./config";
import type { GatewayErrorState, HostConnectionStatus } from "./types";
import { errorMessageLabels } from "./thread-utils/identity";
import { createCoreActions } from "./actions/core";
import { createHostActions } from "./actions/hosts";
import { createProjectActions } from "./actions/projects";
import { registerGatewayDomainSubscribers } from "./domain-subscribers";

export type { ThreadRuntimeStatus } from "./types";

export const useGatewayStore = defineStore("gateway", () => {
  const { t } = useI18n();
  const hosts = ref<HostRecord[]>([]);
  const projects = ref<ProjectRecord[]>([]);
  const projectDirectoryAvailability = ref<Record<number, ProjectDirectoryAvailability>>({});
  const models = ref<ModelRecord[]>([]);
  const modelsHostId = ref<number | null>(null);
  const loadingModels = ref(false);
  const hostConnectionStatuses = ref<
    Record<number, { status: HostConnectionStatus; message?: string | null; updatedAt?: number }>
  >({});
  const gatewayConfig = ref<GatewayConfig>(defaultGatewayConfig());
  const initializing = ref(true);
  const error = ref<GatewayErrorState | null>(null);

  const navigation = useGatewayNavigationStore();
  const selectedHost = computed(
    () => hosts.value.find((host) => host.id === navigation.selectedHostId) ?? null,
  );
  const selectedProject = computed(
    () => projects.value.find((project) => project.id === navigation.selectedProjectId) ?? null,
  );
  const pinnedThreads = computed(() => gatewayConfig.value.pinnedThreads);
  const defaultModel = computed(
    () => models.value.find((model) => model.isDefault) ?? models.value[0] ?? null,
  );
  const errorLabels = computed(() => errorMessageLabels(t));

  const actions = {
    ...createCoreActions(),
    ...createHostActions(),
    ...createProjectActions(),
  };

  function setHostConnectionStatus(
    hostId: number,
    status: HostConnectionStatus,
    message?: string | null,
  ) {
    hostConnectionStatuses.value = {
      ...hostConnectionStatuses.value,
      [hostId]: { status, message, updatedAt: Date.now() },
    };
  }

  function resetState() {
    hosts.value = [];
    projects.value = [];
    projectDirectoryAvailability.value = {};
    models.value = [];
    modelsHostId.value = null;
    loadingModels.value = false;
    hostConnectionStatuses.value = {};
    gatewayConfig.value = defaultGatewayConfig();
    initializing.value = true;
    error.value = null;
    useGatewayNavigationStore().resetState();
    useGatewayThreadRuntimeStore().resetState();
    useGatewayThreadViewStore().resetState();
    useGatewayComposerStore().resetState();
  }

  registerGatewayDomainSubscribers();

  return {
    hosts,
    projects,
    projectDirectoryAvailability,
    models,
    modelsHostId,
    loadingModels,
    hostConnectionStatuses,
    gatewayConfig,
    initializing,
    error,
    selectedHost,
    selectedProject,
    pinnedThreads,
    defaultModel,
    errorLabels,
    t,
    setHostConnectionStatus,
    resetState,
    ...actions,
  };
});
