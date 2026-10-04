import type { ThreadSettingsState } from "~~/shared/types";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { expectTurnSettingsUpdated } from "@/stores/gateway-realtime/response-parsers";

export function requestRunningTurnSettingsUpdate(input: {
  hostId: number;
  threadId: string;
  turnId: string;
  settings: Pick<ThreadSettingsState, "model" | "effort" | "summary">;
}) {
  return useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "turn.settings.update",
      requestId,
      hostId: input.hostId,
      threadId: input.threadId,
      turnId: input.turnId,
      model: input.settings.model,
      effort: input.settings.effort,
      summary: input.settings.summary,
    }),
    expectTurnSettingsUpdated,
  );
}
