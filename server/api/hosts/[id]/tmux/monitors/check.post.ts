import { getRouterParam } from "h3";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../../../../utils/gateway/http/errors";
import { requireRecord } from "../../../../../utils/gateway/http/validation/common";
import { hostStore } from "../../../../../utils/gateway/state/hosts";
import { tmuxMonitorService } from "../../../../../utils/gateway/tmux-monitor/monitor-service";

export default defineGatewayEventHandler(async (event) => {
  const hostId = Number(getRouterParam(event, "id"));
  const host = requireRecord(hostStore.getWithSecret(hostId), "Host not found");
  setGatewayRequestLogContext(event, "tmux.monitors.check", hostLogContext(host));
  return await tmuxMonitorService.checkHost(event.context.auth!.user.id, host);
});
