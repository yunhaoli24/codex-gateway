import type { HostRecord, PinnedThreadRecord } from "~~/shared/types";

export function hostRuntimeFingerprint(host: HostRecord) {
  return JSON.stringify({
    sshHost: host.sshHost,
    username: host.username,
    port: host.port,
    authMode: host.authMode,
    privateKeyPath: host.privateKeyPath,
    privateKey: host.privateKey,
    password: host.password,
    proxyUrl: host.proxyUrl,
  });
}

export function pinnedThreadFingerprint(hostId: number, threads: PinnedThreadRecord[]) {
  return JSON.stringify(
    threads
      .filter((thread) => thread.hostId === hostId)
      .map((thread) => ({
        threadId: thread.threadId,
        projectId: thread.projectId ?? null,
        subtitle: thread.subtitle ?? null,
      })),
  );
}
