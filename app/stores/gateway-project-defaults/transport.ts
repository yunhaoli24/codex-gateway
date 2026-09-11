import type { AgentProjectDefaults, AgentProviderId } from "~~/shared/types";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { expectProjectDefaultsSnapshot } from "@/stores/gateway-realtime/response-parsers";

export async function requestProjectDefaults(input: {
  hostId: number;
  projectId: number;
  provider: AgentProviderId;
}): Promise<AgentProjectDefaults> {
  const response = await useGatewayRealtimeStore().request(
    (requestId) => ({ type: "project.defaults.read", requestId, ...input }),
    expectProjectDefaultsSnapshot,
    // Defaults decorate the composer; a temporarily unavailable host must not cover the timeline
    // with a global error notification. A later project visit retries the uncached request.
    { errorMode: "return" },
  );
  return response.defaults;
}
