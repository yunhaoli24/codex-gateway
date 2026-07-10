import {
  defineGatewayEventHandler,
  exposeCurrentUserConfigRevision,
} from "../../utils/gateway/http/errors";
import { runtimeConfigStore } from "../../utils/gateway/state/runtime-config";

export default defineGatewayEventHandler((event) => {
  exposeCurrentUserConfigRevision(event);
  return runtimeConfigStore.export();
});
