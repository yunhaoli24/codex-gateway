import type { Page } from "@playwright/test";

interface SeedGatewayThreadInput {
  hostId?: number;
  projectId?: number | null;
  threadId?: string | null;
  host?: Record<string, unknown>;
  project?: Record<string, unknown> | null;
  currentThread?: unknown;
  history?: unknown;
  threads?: unknown[];
  status?: "idle" | "running" | "completed" | "failed" | "interrupted";
}

interface MockThreadSnapshotInput {
  hostId?: number;
  snapshots: Record<
    string,
    {
      thread?: unknown;
      history?: unknown;
      projectId?: number | null;
      project?: unknown;
      threadSettings?: unknown;
      tokenUsage?: unknown;
      turnsPage?: {
        nextCursor: string | null;
        backwardsCursor: string | null;
      };
      recentEvents?: unknown[];
      lastEventId?: number;
    }
  >;
}

export async function seedGatewayThread(page: Page, input: SeedGatewayThreadInput) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const hostId = input.hostId ?? 1;
    const projectId = input.projectId ?? null;
    const threadId = input.threadId ?? null;
    store.hosts = [
      input.host ?? {
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    store.projects = input.project
      ? [input.project]
      : projectId
        ? [{ id: projectId, hostId, name: "E2E Project", remotePath: "/tmp/e2e" }]
        : [];
    store.threads = input.threads ?? [];
    store.selectedHostId = hostId;
    store.selectedProjectId = projectId;
    store.selectedThreadId = threadId;
    store.currentThread = input.currentThread ?? (threadId ? { id: threadId } : null);
    store.history = input.history ?? (threadId ? { thread: { id: threadId, turns: [] } } : null);
    store.initializing = false;
    store.loading = false;
    if (threadId && input.status) {
      store.setThreadStatus(hostId, threadId, input.status);
    }
  }, input);
}

export async function installRealtimeThreadSnapshotMock(
  page: Page,
  input: MockThreadSnapshotInput,
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.realtimeSocketConnected = true;
    store.realtimeSocket = {
      readyState: WebSocket.OPEN,
      send(raw: string) {
        const message = JSON.parse(raw);
        if (message.type !== "thread.activate") {
          return;
        }
        const snapshot = input.snapshots[String(message.threadId)];
        if (!snapshot) {
          throw new Error(`Missing mocked thread snapshot for ${message.threadId}`);
        }
        window.setTimeout(() => {
          store.handleRealtimeMessage({
            type: "thread.snapshot",
            requestId: message.requestId,
            hostId: message.hostId ?? input.hostId ?? 1,
            threadId: message.threadId,
            thread: snapshot.thread ?? { id: message.threadId },
            history: snapshot.history ?? { thread: { id: message.threadId, turns: [] } },
            runtimeStatus: null,
            projectId: snapshot.projectId ?? null,
            project: snapshot.project ?? null,
            threadSettings: snapshot.threadSettings ?? {},
            tokenUsage: snapshot.tokenUsage ?? null,
            turnsPage: snapshot.turnsPage ?? { nextCursor: null, backwardsCursor: null },
            recentEvents: snapshot.recentEvents ?? [],
            lastEventId: snapshot.lastEventId ?? 0,
          });
        }, 0);
      },
    };
  }, input);
}
