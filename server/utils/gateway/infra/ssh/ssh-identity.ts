import { createHash } from "node:crypto";
import type { HostWithSecret } from "./ssh-types";
import { resolveSshConfig } from "./ssh-config";

/** A proxy's authentication can select its network namespace. Hash the whole route so private
 * addresses behind different proxy tenants never share trust, RPC, or upgrade state. SSH login
 * credentials are deliberately excluded: rotating a key does not create a new remote account. */
export function sshEndpointIdentity(host: HostWithSecret) {
  const resolved = resolveSshConfig(host);
  return createHash("sha256")
    .update(JSON.stringify([resolved.hostName, resolved.port, resolved.proxy?.raw ?? null]))
    .digest("hex");
}

export function sshAccountIdentity(host: HostWithSecret) {
  const resolved = resolveSshConfig(host);
  return createHash("sha256")
    .update(JSON.stringify([sshEndpointIdentity(host), resolved.username ?? null]))
    .digest("hex");
}
