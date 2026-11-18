import { ref } from "vue";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { expectModelProviderResult } from "@/stores/gateway-realtime/response-parsers";
import type { ModelProviderOperation } from "~~/shared/model-providers/protocol";
import { modelProviderListSchema } from "~~/shared/model-providers/protocol";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { messageFromError } from "@/stores/gateway/thread-utils/identity";
import { captureSessionEpoch } from "@/utils/session-epoch";

export function useModelProviders(hostId: number) {
  const providers = ref(
    modelProviderListSchema.parse({ data: [], defaultProviderId: "", canChangeDefault: false }),
  );
  const busy = ref(false);
  async function request(operation: ModelProviderOperation) {
    const sessionIsCurrent = captureSessionEpoch();
    busy.value = true;
    try {
      const response = await useGatewayRealtimeStore().request(
        (requestId) => ({ type: "modelProvider.request", requestId, hostId, operation }),
        expectModelProviderResult,
      );
      return sessionIsCurrent() ? response.result : null;
    } catch (error: unknown) {
      // This operation owns all failures, including readiness/timeouts before a server frame.
      // Use return-mode transport to avoid duplicate notifications for server error responses.
      if (sessionIsCurrent()) {
        const bootstrap = useGatewayBootstrapStore();
        bootstrap.setError(
          messageFromError(
            error,
            bootstrap.t("app.modelProviders.requestFailed"),
            bootstrap.errorLabels,
          ),
          { hostId },
        );
      }
      return null;
    } finally {
      busy.value = false;
    }
  }
  async function refresh() {
    const result = await request({ method: "list" });
    if (result?.method === "list") providers.value = result.value;
  }
  return { providers, busy, request, refresh };
}
