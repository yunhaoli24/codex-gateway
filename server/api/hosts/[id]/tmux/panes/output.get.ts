import { getRouterParam, getValidatedQuery } from "h3";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../../../../utils/gateway/http/errors";
import { requireRecord } from "../../../../../utils/gateway/http/validation/common";
import { tmuxPaneOutputQuerySchema } from "../../../../../utils/gateway/http/validation/tmux";
import { hostStore } from "../../../../../utils/gateway/state/hosts";
import { tmuxMonitorService } from "../../../../../utils/gateway/tmux-monitor/monitor-service";

export default defineGatewayEventHandler(async (event) => {
  const hostId = Number(getRouterParam(event, "id"));
  const host = requireRecord(hostStore.getWithSecret(hostId), "Host not found");
  const query = await getValidatedQuery(event, (value) => tmuxPaneOutputQuerySchema.parse(value));
  setGatewayRequestLogContext(event, "tmux.panes.output", {
    ...hostLogContext(host),
    sessionId: query.sessionId,
    paneId: query.paneId,
  });
  return await tmuxMonitorService.capturePane(host, query);
});
