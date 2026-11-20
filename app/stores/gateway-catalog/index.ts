import { computed, ref } from "vue";
import { useGatewayTranslator } from "@/composables/i18n/useGatewayTranslator";
import { defineStore } from "pinia";
import type { HostRecord, ModelRecord, ProjectRecord } from "~~/shared/types";
import type { HostConnectionStatus } from "@/stores/gateway/types";
import { createHostActions } from "@/stores/gateway/actions/hosts";
import { createProjectActions } from "@/stores/gateway/actions/projects";
import type { HostUpgradeProgress } from "~~/shared/host-upgrade";
import { createHostUpgradeActions } from "./host-upgrades";
import type { HostLifecycleMessage } from "~~/shared/host-lifecycle-message";
import { hostLifecycleMessage } from "@/utils/host-lifecycle-message";

export const useGatewayCatalogStore = defineStore("gateway-catalog", () => {
  const t = useGatewayTranslator();
  const hosts = ref<HostRecord[]>([]);
  const projects = ref<ProjectRecord[]>([]);
  const models = ref<ModelRecord[]>([]);
  const modelsHostId = ref<number | null>(null);
  const modelsProvider = ref<string | null>(null);
  const loadingModels = ref(false);
  const hostConnectionStatuses = ref<
    Record<
      number,
      {
        status: HostConnectionStatus;
        message?: string | null;
        messageTranslation?: HostLifecycleMessage;
        updatedAt?: number;
        upgradeProgress?: HostUpgradeProgress | null;
      }
    >
  >({});
  const localizedHostConnectionStatuses = computed(() =>
    Object.fromEntries(
      Object.entries(hostConnectionStatuses.value).map(([hostId, connection]) => [
        hostId,
        { ...connection, message: hostLifecycleMessage(connection, t) },
      ]),
    ),
  );
  const defaultModel = computed(
    () => models.value.find((model) => model.isDefault === true) ?? models.value[0] ?? null,
  );

  function setHostConnectionStatus(
    hostId: number,
    status: HostConnectionStatus,
    message?: string | null,
  ) {
    hostConnectionStatuses.value = {
      ...hostConnectionStatuses.value,
      // Navigation/MFA owns connection status, not the server's active upgrade sample.
      [hostId]: {
        ...hostConnectionStatuses.value[hostId],
        status,
        message,
        messageTranslation: undefined,
        updatedAt: Date.now(),
      },
    };
  }

  function resetState() {
    hosts.value = [];
    projects.value = [];
    models.value = [];
    modelsHostId.value = null;
    modelsProvider.value = null;
    loadingModels.value = false;
    hostConnectionStatuses.value = {};
  }

  return {
    hosts,
    projects,
    models,
    modelsHostId,
    modelsProvider,
    loadingModels,
    hostConnectionStatuses,
    localizedHostConnectionStatuses,
    defaultModel,
    setHostConnectionStatus,
    resetState,
    ...createHostActions(),
    ...createHostUpgradeActions(),
    ...createProjectActions(),
  };
});
