import { createHash } from "node:crypto";
import { gatewayDatabase } from "../../storage/database";
import type { HostWithSecret } from "./ssh-types";
import { sshEndpointIdentity } from "./ssh-identity";

/** Persistent trust-on-first-use, as with OpenSSH accept-new. Pin the server key during key
 * exchange, before password/MFA authentication. A changed key fails closed, including after a
 * Gateway restart. Endpoint trust includes the proxy tenant but not the SSH login credential. */
export function verifySshHostKey(host: HostWithSecret, key: Buffer) {
  const endpoint = sshEndpointIdentity(host);
  const fingerprint = createHash("sha256").update(key).digest("hex");
  const db = gatewayDatabase();
  db.prepare("INSERT OR IGNORE INTO ssh_host_keys (endpoint, fingerprint) VALUES (?, ?)").run(
    endpoint,
    fingerprint,
  );
  const trusted = db
    .prepare("SELECT fingerprint FROM ssh_host_keys WHERE endpoint = ?")
    .get(endpoint);
  if (trusted?.fingerprint !== fingerprint) {
    throw new Error(
      "SSH server host key changed; verify the remote server identity before reconnecting",
    );
  }
  return fingerprint;
}
