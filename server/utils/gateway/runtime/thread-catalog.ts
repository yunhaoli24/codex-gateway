import type { AppServerThread, HostRecord } from "~~/shared/types";
import type { ControllerRegistry } from "./controller-registry";
import { z } from "zod";
import { appServerThreadSchema } from "~~/shared/runtime/app-server";
import {
  assertWorkspacePath,
  isWorkspacePath,
  workspaceRootsForHost,
} from "../state/workspace-scope";

const threadListPageSchema = z
  .object({
    data: z.array(appServerThreadSchema),
    nextCursor: z.string().nullable().optional(),
  })
  .loose();

export interface ThreadListPage {
  data: AppServerThread[];
  nextCursor?: string | null;
  [key: string]: unknown;
}

export class ThreadCatalogService {
  constructor(private readonly registry: ControllerRegistry) {}

  async listThreads(host: HostRecord, params: Record<string, unknown>): Promise<ThreadListPage> {
    const client = await this.registry.getHostClient(host);
    const roots = workspaceRootsForHost(host.id);
    if (roots !== undefined) {
      if (typeof params.cwd === "string") assertWorkspacePath(host.id, params.cwd);
      const limit = typeof params.limit === "number" ? params.limit : 30;
      const data: AppServerThread[] = [];
      const seen = new Set<string>();
      let cursor = params.cursor;
      let nextCursor: string | null = null;
      do {
        const page = threadListPageSchema.parse(
          await client.request("thread/list", {
            ...params,
            cursor,
            limit: limit - data.length,
          }),
        );
        data.push(...page.data.filter((thread) => isWorkspacePath(host.id, thread.cwd)));
        nextCursor = page.nextCursor ?? null;
        if (nextCursor === null || seen.has(nextCursor)) break;
        seen.add(nextCursor);
        cursor = nextCursor;
      } while (data.length < limit);
      return { data, nextCursor };
    }
    const page = threadListPageSchema.parse(await client.request("thread/list", params));
    return page;
  }

  async listModels(host: HostRecord, params: Record<string, unknown>) {
    const client = await this.registry.getHostClient(host);
    return client.request("model/list", params);
  }
}
