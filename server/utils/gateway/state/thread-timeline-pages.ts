import { LRUCache } from "lru-cache";
import type { AppServerTimelinePage } from "~~/shared/runtime/app-server";
import { currentGatewayUserId } from "./memory";

const MAX_CACHED_PAGES_PER_THREAD = 16;

// Historical pages are disposable copies of Codex data. A per-thread cap alone grows with every
// visited conversation/user, even after its snapshot has been evicted. Let the existing LRU library
// own global capacity and idle expiry; serialized size is a payload estimate, not a V8 heap limit.
const pages = new LRUCache<string, AppServerTimelinePage>({
  max: 256,
  maxSize: 32 * 1024 * 1024,
  sizeCalculation: (page) => Buffer.byteLength(JSON.stringify(page)),
  ttl: 10 * 60_000,
  updateAgeOnGet: true,
  ttlAutopurge: true,
});

export const threadTimelinePageStore = {
  get(hostId: number, threadId: string, cursor: string | null, limit: number) {
    if (cursor === null) return null;
    // The newest page changes while a Turn runs; only official historical cursors are cacheable.
    return pages.get(cacheKey(hostId, threadId, cursor, limit)) ?? null;
  },

  set(
    hostId: number,
    threadId: string,
    cursor: string | null,
    limit: number,
    page: AppServerTimelinePage,
  ) {
    if (cursor === null) return;
    pages.set(cacheKey(hostId, threadId, cursor, limit), page);
    const prefix = `${scopePrefix()}:${hostId}:${threadId}:`;
    let retained = 0;
    // LRU keys iterate from most to least recently used, so no timestamp array or extra index is
    // needed to retain the existing per-conversation bound as well as the global bound.
    for (const key of pages.keys()) {
      if (key.startsWith(prefix) && ++retained > MAX_CACHED_PAGES_PER_THREAD) pages.delete(key);
    }
  },

  deleteForHost(hostId: number) {
    const prefix = `${scopePrefix()}:${hostId}:`;
    for (const key of pages.keys()) {
      if (key.startsWith(prefix)) pages.delete(key);
    }
  },
};

function cacheKey(hostId: number, threadId: string, cursor: string, limit: number) {
  return `${scopePrefix()}:${hostId}:${threadId}:${limit}:${cursor}`;
}

function scopePrefix() {
  const userId = currentGatewayUserId();
  if (userId === null) throw new Error("Timeline page cache requires an authenticated user scope");
  return String(userId);
}
