export function defaultGatewayHost(hostId = 1) {
  const now = new Date().toISOString();
  return {
    id: hostId,
    name: "E2E Host",
    sshHost: "localhost",
    username: "codex",
    port: 22,
    authMode: "password",
    privateKeyPath: null,
    privateKey: null,
    password: null,
    proxyUrl: null,
    hasPassword: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultGatewayProject(hostId = 1, projectId = 1) {
  return {
    id: projectId,
    hostId,
    name: "E2E Project",
    remotePath: "/tmp/e2e",
  };
}

export function emptyThreadHistory(threadId: string) {
  return { thread: { id: threadId, turns: [] } };
}
