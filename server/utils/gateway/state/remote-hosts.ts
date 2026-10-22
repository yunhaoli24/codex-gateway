import { createHash } from "node:crypto";
import type { HostRecord } from "~~/shared/types";
import { currentGatewayUserId, runWithGatewayUser } from "./memory";
import { hostStore } from "./hosts";
import { hostRuntimeFingerprint } from "../runtime/host-runtime-fingerprint";

interface RemoteHostAlias {
  userId: number;
  hostId: number;
  remoteKey: string;
  fingerprint: string;
  owners: Set<object>;
}

const aliases = new Map<string, RemoteHostAlias>();

/** Register only after this user's SSH authentication succeeds. Configuration alone is not
 * authorization to read another user's warm transcript, particularly on MFA hosts. */
export const remoteHosts = {
  identityKey(identity: readonly unknown[]) {
    return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  },

  bind(host: HostRecord, remoteKey: string, owner: object) {
    const userId = requiredGatewayUserId();
    const key = aliasKey(userId, host.id);
    const fingerprint = hostRuntimeFingerprint(host);
    const previous = aliases.get(key);
    if (previous?.remoteKey === remoteKey && previous.fingerprint === fingerprint) {
      previous.owners.add(owner);
      return remoteKey;
    }
    aliases.set(key, {
      userId,
      hostId: host.id,
      remoteKey,
      fingerprint,
      owners: new Set([owner]),
    });
    return remoteKey;
  },

  key(hostId: number) {
    return this.keyForUser(requiredGatewayUserId(), hostId);
  },

  keyForUser(userId: number, hostId: number) {
    return aliases.get(aliasKey(userId, hostId))?.remoteKey ?? null;
  },

  unbind(hostId: number, owner: object) {
    const key = aliasKey(requiredGatewayUserId(), hostId);
    // A superseded session can finish closing after its replacement has already authenticated.
    const alias = aliases.get(key);
    if (alias?.owners.delete(owner) === true && alias.owners.size === 0) aliases.delete(key);
  },

  forEachAlias(remoteKey: string, deliver: (hostId: number) => void) {
    for (const alias of aliases.values()) {
      if (alias.remoteKey !== remoteKey) continue;
      runWithGatewayUser(alias.userId, () => {
        const host = hostStore.getWithSecret(alias.hostId);
        if (host !== null && hostRuntimeFingerprint(host) === alias.fingerprint) {
          deliver(alias.hostId);
        }
      });
    }
  },
};

export function requiredGatewayUserId() {
  const userId = currentGatewayUserId();
  if (userId === null) throw new Error("Remote runtime requires an authenticated user scope");
  return userId;
}

function aliasKey(userId: number, hostId: number) {
  return `${userId}:${hostId}`;
}
