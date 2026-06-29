import { CodexRuntimeService } from "./codex-runtime";
import { RemoteFileService } from "./remote-files";
import { SshConnectionPool } from "./ssh-connection";

export const sshConnections = new SshConnectionPool();
export const remoteFiles = new RemoteFileService(sshConnections);
export const codexRuntime = new CodexRuntimeService(sshConnections);
