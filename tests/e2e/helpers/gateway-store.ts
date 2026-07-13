import type { Page } from "@playwright/test";
import type { GatewayEvent } from "../../../shared/types";
import {
  defaultGatewayHost,
  defaultGatewayProject,
  emptyThreadHistory,
} from "../fixtures/thread-history";

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
  loading?: boolean;
  olderTurnsCursor?: string | null;
  newerTurnsCursor?: string | null;
  events?: GatewayEvent[];
  lastEventId?: number;
  threadViews?: Record<string, unknown>;
}

interface MockThreadSnapshotInput {
  hostId?: number;
  responseDelayMs?: number;
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
      runtimeStatus?: "idle" | "running" | "completed" | "failed" | "interrupted" | null;
    }
  >;
}

type SeedGatewayThreadRuntimeInput = SeedGatewayThreadInput & {
  defaultHost: Record<string, unknown>;
  defaultProject: Record<string, unknown>;
  defaultHistory: unknown;
};

export async function seedGatewayThread(page: Page, input: SeedGatewayThreadInput) {
  const runtimeInput: SeedGatewayThreadRuntimeInput = {
    ...input,
    defaultHost: defaultGatewayHost(input.hostId ?? 1),
    defaultProject: defaultGatewayProject(input.hostId ?? 1, input.projectId ?? 1),
    defaultHistory: input.threadId ? emptyThreadHistory(input.threadId) : null,
  };
  await page.evaluate((input: SeedGatewayThreadRuntimeInput) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const hostId = input.hostId ?? 1;
    const projectId = input.projectId ?? null;
    const threadId = input.threadId ?? null;
    store.hosts = [input.host ?? input.defaultHost];
    store.projects = input.project ? [input.project] : projectId ? [input.defaultProject] : [];
    store.threads = input.threads ?? [];
    store.selectedHostId = hostId;
    store.selectedProjectId = projectId;
    store.selectedThreadId = threadId;
    store.currentThread = input.currentThread ?? (threadId ? { id: threadId } : null);
    store.history = input.history ?? (threadId ? input.defaultHistory : null);
    store.events = input.events ?? [];
    store.lastEventId = input.lastEventId ?? store.lastEventId;
    store.olderTurnsCursor = input.olderTurnsCursor ?? null;
    store.newerTurnsCursor = input.newerTurnsCursor ?? null;
    store.threadViews = { ...store.threadViews, ...input.threadViews };
    store.initializing = false;
    store.loading = input.loading ?? false;
    if (threadId && input.status) {
      store.setThreadStatus(hostId, threadId, input.status);
    }
  }, runtimeInput);
}

export async function installRealtimeThreadSnapshotMock(
  page: Page,
  input: MockThreadSnapshotInput,
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    const realtime = pinia?._s?.get("gateway-realtime");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    if (!realtime) {
      throw new Error("Unable to locate gateway realtime Pinia store");
    }
    realtime.connected = true;
    (window as any).__threadActivateRequests = [];
    realtime.socket = {
      readyState: WebSocket.OPEN,
      send(raw: string) {
        const message = JSON.parse(raw);
        if (message.type !== "thread.activate") {
          return;
        }
        (window as any).__threadActivateRequests.push(message);
        const snapshot = input.snapshots[String(message.threadId)];
        if (!snapshot) {
          throw new Error(`Missing mocked thread snapshot for ${message.threadId}`);
        }
        window.setTimeout(() => {
          realtime.receiveServerMessage({
            type: "thread.snapshot",
            requestId: message.requestId,
            hostId: message.hostId ?? input.hostId ?? 1,
            threadId: message.threadId,
            thread: snapshot.thread ?? { id: message.threadId },
            history: snapshot.history ?? { thread: { id: message.threadId, turns: [] } },
            runtimeStatus: snapshot.runtimeStatus ?? null,
            projectId: snapshot.projectId ?? null,
            project: snapshot.project ?? null,
            threadSettings: snapshot.threadSettings ?? {},
            tokenUsage: snapshot.tokenUsage ?? null,
            turnsPage: snapshot.turnsPage ?? { nextCursor: null, backwardsCursor: null },
            recentEvents: snapshot.recentEvents ?? [],
            lastEventId: snapshot.lastEventId ?? 0,
          });
        }, input.responseDelayMs ?? 0);
      },
    };
  }, input);
}

export async function threadActivateRequests(page: Page) {
  return page.evaluate(() => (window as any).__threadActivateRequests ?? []);
}

export async function appendAgentStreamLines(
  page: Page,
  input: { itemId: string; prefix: string; count: number },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const turn = store.history.thread.turns[0];
    const agent = turn.items.find((item: any) => item.id === input.itemId);
    agent.text +=
      "\n\n" +
      Array.from(
        { length: input.count },
        (_, index) => `${input.prefix} ${String(index + 1).padStart(3, "0")}`,
      ).join("\n\n");
    store.history = {
      thread: { ...store.history.thread, turns: [...store.history.thread.turns] },
    };
  }, input);
}

export async function appendFileDiffLines(
  page: Page,
  input: { itemId: string; path: string; prefix: string; count: number },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const turn = store.history.thread.turns[0];
    const fileChange = turn.items.find((item: any) => item.id === input.itemId);
    const change = fileChange.changes.find((candidate: any) => candidate.path === input.path);
    change.diff +=
      "\n" +
      Array.from(
        { length: input.count },
        (_, index) => `+${input.prefix} ${String(index + 1).padStart(3, "0")}`,
      ).join("\n");
    store.history = {
      thread: { ...store.history.thread, turns: [...store.history.thread.turns] },
    };
  }, input);
}

export async function appendCommandOutputLines(
  page: Page,
  input: { itemId: string; prefix: string; count: number },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const turn = store.history.thread.turns[0];
    const command = turn.items.find((item: any) => item.id === input.itemId);
    command.aggregatedOutput +=
      "\n" +
      Array.from(
        { length: input.count },
        (_, index) => `${input.prefix} ${String(index + 1).padStart(3, "0")}`,
      ).join("\n");
    store.history = {
      thread: { ...store.history.thread, turns: [...store.history.thread.turns] },
    };
  }, input);
}

export async function completeTurnWithFinalAgentMessage(
  page: Page,
  input: {
    agentItemId: string;
    finalItemId: string;
    finalText: string;
  },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const turn = store.history.thread.turns[0];
    turn.status = "completed";
    const agent = turn.items.find((item: any) => item.id === input.agentItemId);
    agent.status = "completed";
    turn.items.push({
      id: input.finalItemId,
      type: "agentMessage",
      phase: "final_answer",
      status: "completed",
      text: input.finalText,
    });
    store.history = {
      thread: { ...store.history.thread, turns: [...store.history.thread.turns] },
    };
  }, input);
}

export async function applyGatewayLiveEvent(page: Page, event: GatewayEvent) {
  await page.evaluate((event) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.applyLiveEvent(event);
  }, event);
}

export async function replayGatewayLiveEvents(page: Page, events: GatewayEvent[]) {
  await page.evaluate((events) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    for (const event of events) {
      store.applyLiveEvent(event);
    }
  }, events);
}

export async function receiveRealtimeThreadEvent(page: Page, event: GatewayEvent) {
  await page.evaluate((event) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const realtime = app?.config?.globalProperties?.$pinia?._s?.get("gateway-realtime");
    if (!realtime) {
      throw new Error("Unable to locate gateway realtime Pinia store");
    }
    realtime.receiveServerMessage({
      type: "thread.event",
      event,
    });
  }, event);
}

export async function openThreadInStore(
  page: Page,
  input: { threadId: string; hostId: number; projectId?: number | null },
) {
  await page.evaluate(async (input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    await store.openThread(input.threadId, {
      hostId: input.hostId,
      projectId: input.projectId ?? null,
    });
  }, input);
}

export async function selectedThreadStatusInStore(page: Page) {
  return page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    return store.selectedThreadStatus;
  });
}

export async function cacheSelectedThreadAndOpenThread(
  page: Page,
  input: {
    threadId: string;
    hostId: number;
    projectId?: number | null;
    otherThreadId: string;
    otherThreadName: string;
  },
) {
  await page.evaluate(async (input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.cacheSelectedThreadView();
    store.selectedThreadId = input.otherThreadId;
    store.currentThread = { id: input.otherThreadId, name: input.otherThreadName };
    store.history = { thread: { id: input.otherThreadId, turns: [] } };
    await store.openThread(input.threadId, {
      hostId: input.hostId,
      projectId: input.projectId ?? null,
    });
  }, input);
}

export async function setThreadViewHistoryAndStatus(
  page: Page,
  input: {
    hostId: number;
    threadId: string;
    history: unknown;
    status?: "idle" | "running" | "completed" | "failed" | "interrupted";
    turnId?: string | null;
  },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const key = `${input.hostId}:${input.threadId}`;
    store.threadViews[key] = {
      ...store.threadViews[key],
      hostId: input.hostId,
      threadId: input.threadId,
      history: input.history,
    };
    if (input.status) {
      store.setThreadStatus(input.hostId, input.threadId, input.status, {
        turnId: input.turnId ?? null,
      });
    }
  }, input);
}

export function subAgentRuntimeFlags(
  page: Page,
  input: { hostId: number; firstThreadId: string; secondThreadId: string },
) {
  return page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    const realtime = pinia?._s?.get("gateway-realtime");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    if (!realtime) {
      throw new Error("Unable to locate gateway realtime Pinia store");
    }
    const firstKey = `${input.hostId}:${input.firstThreadId}`;
    const secondKey = `${input.hostId}:${input.secondThreadId}`;
    return {
      view: Boolean(store.threadViews[firstKey]),
      secondView: Boolean(store.threadViews[secondKey]),
      subscribed: Boolean(realtime.threadSubscriptions[firstKey]),
      secondSubscribed: Boolean(realtime.threadSubscriptions[secondKey]),
    };
  }, input);
}

export async function setThreadCollaborationMode(
  page: Page,
  input: { hostId: number; threadId: string; mode: "default" | "plan" },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.setThreadCollaborationMode(input.hostId, input.threadId, input.mode);
  }, input);
}

export async function dismissPlanPrompt(
  page: Page,
  input: { hostId: number; threadId: string; planItemId: string },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.dismissPlanImplementationPrompt(input.hostId, input.threadId, input.planItemId);
  }, input);
}

export async function installSelectedThreadGoalSubmitMock(
  page: Page,
  input: { hostId: number; threadId: string; windowKey: string },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.setSelectedThreadGoal = async (objective: string) => {
      (window as any)[input.windowKey] = objective;
      store.upsertThreadGoal(
        input.hostId,
        input.threadId,
        {
          threadId: input.threadId,
          objective,
          status: "active",
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        { showInTimeline: true },
      );
    };
  }, input);
}

export async function installSelectedThreadGoalControlMock(
  page: Page,
  input: { hostId: number; threadId: string; windowKey: string },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    (window as any)[input.windowKey] = [];
    store.setSelectedThreadGoalStatus = async (status: string) => {
      (window as any)[input.windowKey].push({ type: "status", status });
      store.upsertThreadGoal(input.hostId, input.threadId, {
        threadId: input.threadId,
        objective: store.selectedThreadGoal?.objective ?? "existing goal",
        status,
        tokenBudget: null,
        tokensUsed: 0,
        timeUsedSeconds: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    };
    store.clearSelectedThreadGoal = async () => {
      (window as any)[input.windowKey].push({ type: "clear" });
      store.clearThreadGoalState(input.hostId, input.threadId);
    };
  }, input);
}

export async function installServerRequestResponderMock(
  page: Page,
  input: { mode: "capture"; windowKey: string } | { mode: "fail"; message: string },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway-thread-turns");
    if (!store) {
      throw new Error("Unable to locate gateway thread-turns Pinia store");
    }
    if (input.mode === "capture") {
      (window as any)[input.windowKey] = null;
      store.respondToServerRequest = async (
        hostId: number,
        threadId: string,
        requestId: string | number,
        result: unknown,
      ) => {
        (window as any)[input.windowKey] = { hostId, threadId, requestId, result };
      };
      return;
    }
    store.respondToServerRequest = async () => {
      throw new Error(input.message);
    };
  }, input);
}

export async function installRealtimeInterruptMock(
  page: Page,
  input: { windowKey: string; passThroughNonInterrupt?: boolean },
) {
  await page.evaluate((input) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const realtime = app?.config?.globalProperties?.$pinia?._s?.get("gateway-realtime");
    if (!realtime) {
      throw new Error("Unable to locate gateway realtime Pinia store");
    }
    realtime.connected = true;
    (window as any)[input.windowKey] = null;
    const previousSocket = realtime.socket;
    realtime.socket = {
      readyState: WebSocket.OPEN,
      send(raw: string) {
        const message = JSON.parse(raw);
        if (input.passThroughNonInterrupt && message.type !== "turn.interrupt") {
          previousSocket?.send(raw);
          return;
        }
        (window as any)[input.windowKey] = message;
        window.setTimeout(() => {
          realtime.receiveServerMessage({
            type: "turn.interrupt.accepted",
            requestId: message.requestId,
            hostId: message.hostId,
            threadId: message.threadId,
          });
        }, 0);
      },
    };
  }, input);
}

export async function interruptActiveTurnInStore(page: Page) {
  await page.evaluate(async () => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway-thread-turns");
    if (!store) {
      throw new Error("Unable to locate gateway thread-turns Pinia store");
    }
    await store.interruptActiveTurn();
  });
}
