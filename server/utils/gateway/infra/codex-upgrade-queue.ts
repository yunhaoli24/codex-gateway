import pLimit from "p-limit";
import { currentGatewayUserId, runWithGatewayUser } from "../state/memory";

/**
 * Remote installs share the Gateway's outbound bandwidth, so only artifact preparation, transfer,
 * and installation are serialized. Version probes and normal Host traffic stay concurrent.
 */
export class CodexUpgradeQueue {
  private readonly limit = pLimit(1);

  get busy() {
    return this.limit.activeCount > 0 || this.limit.pendingCount > 0;
  }

  async run<T>(work: () => Promise<T>) {
    const userId = currentGatewayUserId();
    return await this.limit(() => (userId ? runWithGatewayUser(userId, work) : work()));
  }
}
