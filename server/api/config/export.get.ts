import { defineGatewayEventHandler } from "../../utils/gateway/http/errors";
import { runtimeConfigStore } from "../../utils/gateway/state/runtime-config";

export default defineGatewayEventHandler(() => runtimeConfigStore.export());
