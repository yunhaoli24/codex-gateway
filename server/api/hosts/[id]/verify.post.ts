import { getRouterParam } from "h3";
import { codexRuntime } from "../../../utils/gateway/infra/host-services";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../../utils/gateway/http/errors";
import { requireRecord } from "../../../utils/gateway/http/validation";
import { hostStore } from "../../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const host = requireRecord(hostStore.getWithSecret(id), "Host not found");
  setGatewayRequestLogContext(event, "hosts/verify", hostLogContext(host));
  return codexRuntime.verify(host);
});
