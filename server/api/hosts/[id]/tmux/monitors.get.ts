import { getRouterParam } from "h3";
import { defineGatewayEventHandler } from "../../../../utils/gateway/http/errors";
import { requireRecord } from "../../../../utils/gateway/http/validation/common";
import { hostStore } from "../../../../utils/gateway/state/hosts";
import { tmuxMonitorService } from "../../../../utils/gateway/tmux-monitor/monitor-service";

export default defineGatewayEventHandler((event) => {
  const hostId = Number(getRouterParam(event, "id"));
  requireRecord(hostStore.get(hostId), "Host not found");
  return tmuxMonitorService.list(event.context.auth!.user.id, hostId);
});
