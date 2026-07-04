import type { HostRecord, ThreadSettingsState } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";

export class ThreadSettingsService {
  constructor(private readonly registry: ControllerRegistry) {}

  async updateThreadSettings(host: HostRecord, threadId: string, input: ThreadSettingsState) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    const params: Record<string, unknown> = { threadId };
    if ("model" in input) params.model = input.model;
    if ("effort" in input) params.effort = input.effort;
    if ("approvalPolicy" in input) params.approvalPolicy = input.approvalPolicy;
    return controller.enqueue(() => controller.client.request("thread/settings/update", params));
  }

  async renameThread(host: HostRecord, threadId: string, name: string) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    return controller.enqueue(() =>
      controller.client.request("thread/name/set", { threadId, name }),
    );
  }
}
