import { parseCodexVersion } from "./codex-version";
import { LocalHttpConnectProxy } from "./http-connect-proxy";
import { codexRemoteUpgradeAndRestartPayload, remoteLoginShellCommand } from "./remote-command";
import type { SshConnectionPool } from "./ssh-connection";
import type { HostWithSecret } from "./ssh-types";

export class CodexUpgrader {
  constructor(private readonly ssh: SshConnectionPool) {}

  async upgrade(host: HostWithSecret, version: string) {
    const proxy = new LocalHttpConnectProxy();
    const localProxyPort = await proxy.listen();
    const result = await this.ssh
      .withReverseTcpForward(
        host,
        {
          remoteHost: "127.0.0.1",
          remotePort: 0,
          targetHost: "127.0.0.1",
          targetPort: localProxyPort,
        },
        async (remoteProxyPort) =>
          await this.ssh.exec(
            host,
            remoteLoginShellCommand(
              codexRemoteUpgradeAndRestartPayload(version, `http://127.0.0.1:${remoteProxyPort}`),
            ),
          ),
      )
      .finally(async () => {
        await proxy.close();
      });
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || "Failed to upgrade remote Codex");
    }
    const parsed = parseCodexVersion(result.stdout);
    if (!parsed) {
      throw new Error(`Unable to parse upgraded remote Codex version: ${result.stdout.trim()}`);
    }
    return parsed.version;
  }
}
