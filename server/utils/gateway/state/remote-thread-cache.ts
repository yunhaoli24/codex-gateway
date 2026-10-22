import { LRUCache } from "lru-cache";
import { remoteHosts } from "./remote-hosts";

interface ThreadCacheEntry<Value> {
  remoteKey: string;
  threadId: string;
  updatedAt: number;
  value: Value;
}

/** Store provider data once per authenticated remote instance. User host IDs are aliases,
 * projected only at the transport boundary; they must never be stored inside shared entries.
 * LRU owns idle expiry, independently of the number of users or conversations. */
export class RemoteThreadCache<Value extends object> {
  private readonly cache: LRUCache<string, ThreadCacheEntry<Value>>;

  constructor(ttl: number) {
    this.cache = new LRUCache({ ttl, ttlAutopurge: true, updateAgeOnGet: true });
  }

  get(hostId: number, threadId: string): Value | undefined {
    const remoteKey = remoteHosts.key(hostId);
    return remoteKey === null ? undefined : this.cache.get(`${remoteKey}:${threadId}`)?.value;
  }

  set(hostId: number, threadId: string, value: Value) {
    const remoteKey = remoteHosts.key(hostId);
    if (remoteKey === null) throw new Error("Remote thread cache requires an authenticated Host");
    this.cache.set(`${remoteKey}:${threadId}`, {
      remoteKey,
      threadId,
      updatedAt: Date.now(),
      value,
    });
  }

  listForHost(hostId: number) {
    const remoteKey = remoteHosts.key(hostId);
    return [...this.cache.values()]
      .filter((entry) => entry.remoteKey === remoteKey)
      .map((entry) => ({ ...entry, hostId }));
  }

  deleteForRemote(remoteKey: string) {
    for (const [key, entry] of this.cache) {
      if (entry.remoteKey === remoteKey) this.cache.delete(key);
    }
  }
}
