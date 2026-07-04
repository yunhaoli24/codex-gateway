import type { HostRecord, ThreadGoalStatus } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";

export class ThreadGoalService {
  constructor(private readonly registry: ControllerRegistry) {}

  async setThreadGoal(
    host: HostRecord,
    threadId: string,
    input: {
      objective?: string | null;
      status?: ThreadGoalStatus | null;
      tokenBudget?: number | null;
    },
  ) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    const params: Record<string, unknown> = { threadId };
    if ("objective" in input) params.objective = input.objective;
    if ("status" in input) params.status = input.status;
    if ("tokenBudget" in input) params.tokenBudget = input.tokenBudget;
    return controller.enqueue(() => controller.client.request("thread/goal/set", params));
  }

  async getThreadGoal(host: HostRecord, threadId: string) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    return controller.enqueue(() => controller.client.request("thread/goal/get", { threadId }));
  }

  async clearThreadGoal(host: HostRecord, threadId: string) {
    const controller = await this.registry.getController(host, threadId);
    await controller.ensureSubscribed();
    return controller.enqueue(() => controller.client.request("thread/goal/clear", { threadId }));
  }
}
