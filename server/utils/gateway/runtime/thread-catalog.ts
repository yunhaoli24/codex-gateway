import type { HostRecord } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";

export class ThreadCatalogService {
  constructor(private readonly registry: ControllerRegistry) {}

  async listThreads(host: HostRecord, params: Record<string, unknown>) {
    const client = await this.registry.getHostClient(host);
    return client.request("thread/list", params);
  }

  async listModels(host: HostRecord, params: Record<string, unknown>) {
    const client = await this.registry.getHostClient(host);
    return client.request("model/list", params);
  }
}
