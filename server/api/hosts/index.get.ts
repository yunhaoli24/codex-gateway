import { defineGatewayEventHandler } from "../../utils/gateway/http/errors";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(() => {
  return hostStore.list();
});
