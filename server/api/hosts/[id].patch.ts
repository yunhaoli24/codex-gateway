import { getRouterParam, readValidatedBody } from "h3";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { defineGatewayConfigMutationHandler } from "../../utils/gateway/http/config-mutation";
import { saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { hostUpdateSchema } from "../../utils/gateway/http/validation/hosts-projects";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { hostRuntimeSupervisor } from "../../utils/gateway/runtime/host-runtime-supervisor";
import { hostStore } from "../../utils/gateway/state/hosts";
import { terminalManager } from "../../utils/gateway/terminal/terminal-manager";
import { browserPreviewManager } from "../../utils/gateway/browser-preview/browser-preview-manager";

export default defineGatewayConfigMutationHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const userId = event.context.auth!.user.id;
  const input = await readValidatedBody(event, (body) => hostUpdateSchema.parse(body));
  const host = requireRecord(hostStore.update(id, input), "Host not found");
  threadBroker.closeHost(id);
  terminalManager.closeHost(userId, id);
  browserPreviewManager.closeHost(userId, id);
  sshConnections.syncHosts(hostStore.listWithSecret());
  hostRuntimeSupervisor.syncCurrentUserConfig();
  saveCurrentUserConfig(event);
  return host;
});
