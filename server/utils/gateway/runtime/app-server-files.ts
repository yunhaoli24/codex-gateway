import { randomUUID } from "node:crypto";
import type { HostRecord, ProjectFileSearchResult, RpcEnvelope } from "~~/shared/types";
import {
  fsChangedNotificationFromUnknown,
  parseFsWatchResponse,
  parseFuzzyFileSearchResponse,
} from "~~/shared/runtime/app-server/file-system";
import type { AgentRpcClient } from "../agent/provider-adapter";
import { bindGatewayUser, currentGatewayUserId } from "../state/memory";
import { normalizeReferencePath } from "../project-files/project-file-references";
import type { ControllerRegistry } from "./controller-registry";

const FILE_RPC_TIMEOUT_MS = 120_000;
const FILE_WATCH_COALESCE_MS = 150;

export type AppServerFileWatchEvent = { type: "changed"; paths: string[] } | { type: "closed" };

type AppServerFileWatchListener = (event: AppServerFileWatchEvent) => void;

interface ActiveFileWatch {
  token: object;
  client: AgentRpcClient;
  watchId: string;
  requestedPath: string;
  canonicalPath: string;
  listeners: Set<AppServerFileWatchListener>;
  removeNotificationListener: () => void;
  removeCloseListener: () => void;
  pendingPaths: Set<string>;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

interface FileWatchLease {
  rootPath: string;
  release: () => void;
}

export class AppServerFileService {
  private readonly watches = new Map<
    string,
    { token: object; pending: Promise<ActiveFileWatch> }
  >();

  constructor(private readonly registry: ControllerRegistry) {}

  async search(
    host: HostRecord,
    rootPath: string,
    query: string,
    cancellationToken: string,
  ): Promise<ProjectFileSearchResult> {
    if (query.trim() === "") return { files: [] };
    const userId = requiredUserId();
    const client = await this.registry.getHostClient(host);
    const response = await client.request(
      "fuzzyFileSearch",
      {
        query,
        roots: [rootPath],
        // Cancellation tokens are connection-wide. Prefix browser tokens so two users or projects
        // cannot cancel each other's search while sharing the same Gateway process.
        cancellationToken: `gateway:${userId}:${host.id}:${rootPath}:${cancellationToken}`,
      },
      FILE_RPC_TIMEOUT_MS,
      parseFuzzyFileSearchResponse,
    );
    return {
      files: response.files.flatMap((file) => {
        if (file.match_type !== "file" || file.root !== rootPath) return [];
        const path = normalizeReferencePath(file.path);
        return [{ type: "file" as const, path, name: file.file_name }];
      }),
    };
  }

  async watch(
    host: HostRecord,
    rootPath: string,
    listener: AppServerFileWatchListener,
  ): Promise<FileWatchLease> {
    const key = watchKey(requiredUserId(), host.id, rootPath);
    let record = this.watches.get(key);
    if (record === undefined) {
      const token = {};
      record = { token, pending: this.createWatch(key, token, host, rootPath) };
      this.watches.set(key, record);
    }
    let watch: ActiveFileWatch;
    try {
      watch = await record.pending;
    } catch (error) {
      if (this.watches.get(key)?.token === record.token) this.watches.delete(key);
      throw error;
    }
    watch.listeners.add(listener);
    let released = false;
    return {
      rootPath,
      release: () => {
        if (released) return;
        released = true;
        watch.listeners.delete(listener);
        if (watch.listeners.size === 0) this.disposeWatch(key, watch, true);
      },
    };
  }

  private async createWatch(key: string, token: object, host: HostRecord, requestedPath: string) {
    const client = await this.registry.getHostClient(host);
    const watchId = randomUUID();
    const listeners = new Set<AppServerFileWatchListener>();
    const watch: ActiveFileWatch = {
      token,
      client,
      watchId,
      requestedPath,
      canonicalPath: requestedPath,
      listeners,
      removeNotificationListener: () => {},
      removeCloseListener: () => {},
      pendingPaths: new Set(),
      flushTimer: null,
    };
    watch.removeNotificationListener = client.on(
      "notification",
      bindGatewayUser((message: RpcEnvelope) => this.handleNotification(watch, message)),
    );
    watch.removeCloseListener = client.on(
      "close",
      bindGatewayUser(() => {
        this.disposeWatch(key, watch, false);
        for (const subscriber of listeners) subscriber({ type: "closed" });
      }),
    );
    try {
      const response = await client.request(
        "fs/watch",
        { path: requestedPath, watchId },
        FILE_RPC_TIMEOUT_MS,
        parseFsWatchResponse,
      );
      watch.canonicalPath = response.path;
      return watch;
    } catch (error) {
      watch.removeNotificationListener();
      watch.removeCloseListener();
      throw error;
    }
  }

  private handleNotification(watch: ActiveFileWatch, message: RpcEnvelope) {
    if (message.method !== "fs/changed") return;
    const changed = fsChangedNotificationFromUnknown(message.params);
    if (changed === null || changed.watchId !== watch.watchId) return;
    changed.changedPaths.forEach((path) => watch.pendingPaths.add(visibleWatchPath(watch, path)));
    if (watch.flushTimer !== null) return;
    watch.flushTimer = setTimeout(() => {
      watch.flushTimer = null;
      const paths = [...watch.pendingPaths];
      watch.pendingPaths.clear();
      if (paths.length === 0) return;
      for (const listener of watch.listeners) listener({ type: "changed", paths });
    }, FILE_WATCH_COALESCE_MS);
  }

  private disposeWatch(key: string, watch: ActiveFileWatch, notifyServer: boolean) {
    if (this.watches.get(key)?.token === watch.token) this.watches.delete(key);
    watch.removeNotificationListener();
    watch.removeCloseListener();
    if (watch.flushTimer !== null) clearTimeout(watch.flushTimer);
    watch.flushTimer = null;
    watch.pendingPaths.clear();
    if (notifyServer) {
      void watch.client.request("fs/unwatch", { watchId: watch.watchId }).catch(() => {
        // A closing App Server already discarded connection-scoped watches.
      });
    }
  }
}

function watchKey(userId: number, hostId: number, path: string) {
  return `${userId}:${hostId}:${path}`;
}

function requiredUserId() {
  const userId = currentGatewayUserId();
  if (userId === null) throw new Error("App Server file operations require an authenticated user");
  return userId;
}

function visibleWatchPath(watch: ActiveFileWatch, path: string) {
  if (watch.canonicalPath === watch.requestedPath) return path;
  if (path === watch.canonicalPath) return watch.requestedPath;
  const prefix = `${watch.canonicalPath.replace(/\/+$/u, "")}/`;
  return path.startsWith(prefix)
    ? `${watch.requestedPath.replace(/\/+$/u, "")}/${path.slice(prefix.length)}`
    : path;
}
