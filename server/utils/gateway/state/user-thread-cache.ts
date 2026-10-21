import { LRUCache } from "lru-cache";
import { currentGatewayUserId } from "./memory";

interface ThreadCacheEntry<Value> {
  userId: number;
  hostId: number;
  threadId: string;
  updatedAt: number;
  value: Value;
}

/** Runtime caches stay outside GatewayMemoryState: config transactions clone that state, and
 * changing a pin must not copy every transcript/replay buffer. The library owns idle expiry;
 * neither user count nor conversation count is an eviction condition. */
export class UserThreadCache<Value extends object> {
  private readonly cache: LRUCache<string, ThreadCacheEntry<Value>>;

  constructor(ttl: number) {
    this.cache = new LRUCache({ ttl, ttlAutopurge: true, updateAgeOnGet: true });
  }

  get(hostId: number, threadId: string): Value | undefined {
    return this.cache.get(cacheKey(currentUserId(), hostId, threadId))?.value;
  }

  set(hostId: number, threadId: string, value: Value) {
    const userId = currentUserId();
    this.cache.set(cacheKey(userId, hostId, threadId), {
      userId,
      hostId,
      threadId,
      updatedAt: Date.now(),
      value,
    });
  }

  listForHost(hostId: number) {
    const userId = currentUserId();
    // Enumeration must not keep entries alive merely because a sidebar lists a Host.
    return [...this.cache.values()].filter(
      (entry) => entry.userId === userId && entry.hostId === hostId,
    );
  }

  deleteForHost(hostId: number) {
    const userId = currentUserId();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.userId === userId && entry.hostId === hostId) this.cache.delete(key);
    }
  }
}

function currentUserId() {
  const userId = currentGatewayUserId();
  if (userId === null) throw new Error("Thread cache requires an authenticated user scope");
  return userId;
}

function cacheKey(userId: number, hostId: number, threadId: string) {
  return `${userId}:${hostId}:${threadId}`;
}
