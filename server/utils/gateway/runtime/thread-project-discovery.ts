import type { HostWithSecret } from "../infra/ssh/ssh-types";
import { appServerThreadFromUnknown } from "~~/shared/runtime/app-server";
import { bindGatewayUser } from "../state/memory";
import { projectStore } from "../state/projects";
import { threadMetadataStore } from "../state/thread-metadata";
import { threadBroker } from "./broker";
import type { ThreadListPage } from "./thread-catalog";
import { gatewayLog } from "../logging";
import { isWorkspacePath } from "../state/workspace-scope";

export class ThreadProjectDiscoveryService {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly generations = new Map<string, number>();

  indexPage(hostId: number, page: ThreadListPage) {
    for (const value of page.data) {
      const thread = appServerThreadFromUnknown(value);
      if (thread === null || typeof thread.cwd !== "string" || thread.cwd.trim() === "") continue;
      if (!isWorkspacePath(hostId, thread.cwd)) continue;
      try {
        projectStore.ensureForPath(hostId, thread.cwd);
        threadMetadataStore.record(hostId, thread);
      } catch (error) {
        gatewayLog("warn", "gateway", "failed to index thread project", {
          hostId,
          threadId: thread.id,
          cwd: thread.cwd,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  captureGeneration(userId: number, hostId: number) {
    return this.generations.get(this.key(userId, hostId)) ?? 0;
  }

  indexPageIfCurrent(userId: number, hostId: number, generation: number, page: ThreadListPage) {
    if (!this.isCurrent(this.key(userId, hostId), generation)) return false;
    this.indexPage(hostId, page);
    return true;
  }

  schedule(
    userId: number,
    host: HostWithSecret,
    firstPage: ThreadListPage,
    params: Record<string, unknown>,
    generation: number,
  ) {
    const key = this.key(userId, host.id);
    if (
      !this.isCurrent(key, generation) ||
      this.pending.has(key) ||
      firstPage.nextCursor === null ||
      firstPage.nextCursor === undefined ||
      firstPage.nextCursor === ""
    )
      return;
    const discover = bindGatewayUser(async () => {
      let cursor = firstPage.nextCursor ?? null;
      const seen = new Set<string>();
      while (cursor !== null && !seen.has(cursor)) {
        seen.add(cursor);
        const page = await threadBroker.listThreads(host, {
          ...params,
          cursor,
          useStateDbOnly: false,
        });
        if (!this.isCurrent(key, generation)) return;
        this.indexPage(host.id, page);
        cursor = page.nextCursor ?? null;
      }
    });
    const request = discover()
      .catch((error) => {
        gatewayLog("warn", "gateway", "background thread project discovery failed", {
          hostId: host.id,
          hostName: host.name,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
    this.pending.set(key, request);
  }

  invalidateHost(userId: number, hostId: number) {
    const key = this.key(userId, hostId);
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    // The old RPC cannot be cancelled safely on the shared Host connection. Removing only its
    // singleflight ownership allows a new identity to discover immediately, while the generation
    // check prevents the old result from indexing projects after it eventually returns.
    this.pending.delete(key);
  }

  private isCurrent(key: string, generation: number) {
    return (this.generations.get(key) ?? 0) === generation;
  }

  private key(userId: number, hostId: number) {
    return `${userId}:${hostId}`;
  }
}

export const threadProjectDiscovery = new ThreadProjectDiscoveryService();
