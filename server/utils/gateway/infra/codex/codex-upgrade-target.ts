import type { HostWithSecret } from "../ssh/ssh-types";
import { sshAccountIdentity } from "../ssh/ssh-identity";

// Use one identity for the upgrade lock and its observable state. Gateway user/host IDs name
// local aliases. Different valid SSH keys/passwords for the same account still replace the same
// installation directory and must serialize; proxy tenants remain separate network namespaces.
export function remoteUpgradeTargetKey(host: HostWithSecret) {
  return sshAccountIdentity(host);
}
