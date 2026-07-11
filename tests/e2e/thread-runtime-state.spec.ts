import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import {
  applyGatewayLiveEvent,
  cacheSelectedThreadAndOpenThread,
  installRealtimeThreadSnapshotMock,
  openThreadInStore,
  receiveRealtimeThreadEvent,
  replayGatewayLiveEvents,
  seedGatewayThread,
  selectedThreadStatusInStore,
} from "./helpers/gateway-store";

test("opening completed history does not show fake thinking", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-completed-thread";
  const startedEvent = {
    id: 1,
    hostId: 1,
    threadId,
    method: "turn/started",
    payload: { params: { threadId, turn: { id: "turn-1", status: "running", items: [] } } },
    createdAt: "2026-07-02T10:00:00.000Z",
  };
  const completedTurn = {
    id: "turn-1",
    status: "completed",
    items: [
      {
        id: "user-1",
        type: "userMessage",
        content: [{ type: "text", text: "completed history" }],
      },
      {
        id: "agent-1",
        type: "agentMessage",
        phase: "final_answer",
        text: "done",
      },
    ],
  };
  const completedEvent = {
    id: 2,
    hostId: 1,
    threadId,
    method: "turn/completed",
    payload: { params: { threadId, turn: completedTurn } },
    createdAt: "2026-07-02T10:00:01.000Z",
  };
  await seedGatewayThread(page, {
    projectId: 1,
    threadId,
    currentThread: { id: threadId, name: "Completed UI", status: "completed" },
    history: { thread: { id: threadId, turns: [completedTurn] } },
    events: [startedEvent, completedEvent],
    loading: true,
    status: "completed",
  });
  await replayGatewayLiveEvents(page, [startedEvent, completedEvent]);

  await expect(page.getByText("completed history")).toBeVisible();
  await expect(page.getByText("思考中")).toBeHidden();

  await seedGatewayThread(page, {
    threadId: "e2e-stale-running-history-thread",
    currentThread: { id: "e2e-stale-running-history-thread", name: "Stale Running History" },
    history: {
      thread: {
        id: "e2e-stale-running-history-thread",
        turns: [{ id: "turn-stale-running", status: "inProgress", items: [] }],
      },
    },
    status: "completed",
  });
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成");
});

test("opening a cached thread applies terminal events before deriving composer state", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-cached-terminal-thread";
  const staleTurn = {
    id: "turn-stale-1",
    status: "inProgress",
    items: [
      {
        id: "user-stale-1",
        type: "userMessage",
        content: [{ type: "text", text: "stale cached request" }],
      },
    ],
  };
  const completedTurn = {
    ...staleTurn,
    status: "completed",
    items: [
      ...staleTurn.items,
      {
        id: "agent-stale-1",
        type: "agentMessage",
        phase: "final_answer",
        text: "cached turn is done",
      },
    ],
  };

  await installRealtimeThreadSnapshotMock(page, {
    snapshots: {
      [threadId]: {
        thread: { id: threadId, name: "Cached Terminal Thread" },
        history: { thread: { id: threadId, turns: [completedTurn] } },
        threadSettings: {},
        tokenUsage: null,
        projectId: 1,
        project: { id: 1, hostId: 1, name: "E2E Project", remotePath: "/tmp/e2e" },
        turnsPage: { nextCursor: null, backwardsCursor: null },
        recentEvents: [
          {
            id: 1,
            hostId: 1,
            threadId,
            method: "turn/completed",
            payload: { params: { threadId, turn: completedTurn } },
            createdAt: new Date().toISOString(),
          },
        ],
        lastEventId: 1,
      },
    },
  });
  await seedGatewayThread(page, { projectId: 1 });
  await openThreadInStore(page, { threadId, hostId: 1, projectId: 1 });

  await expect(page.getByText("cached turn is done")).toBeVisible();
  await expect.poll(() => selectedThreadStatusInStore(page)).toBe("completed");
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成");
});

test("opening a thread stores browser-local last open selection", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-local-last-open-thread";
  await installRealtimeThreadSnapshotMock(page, {
    snapshots: {
      [threadId]: {
        thread: { id: threadId, name: "Local Last Open Thread" },
        history: { thread: { id: threadId, turns: [] } },
        projectId: 1,
        project: { id: 1, hostId: 1, name: "E2E Project", remotePath: "/tmp/e2e" },
      },
    },
  });
  await seedGatewayThread(page, { projectId: 1, threadId: null });

  await openThreadInStore(page, { threadId, hostId: 1, projectId: 1 });

  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("codex-gateway-navigation")!).lastOpenThread,
      ),
    )
    .toEqual({ hostId: 1, projectId: 1, threadId });
});

test("switching to cached thread history renders without waiting for the next event", async ({
  page,
}) => {
  await openApp(page);
  const secondThreadId = "e2e-visible-second-thread";
  await seedGatewayThread(page, {
    projectId: 1,
    threadId: secondThreadId,
    currentThread: { id: secondThreadId, name: "Second Visible Thread" },
    history: {
      thread: {
        id: secondThreadId,
        turns: [
          {
            id: "turn-visible-second",
            status: "completed",
            items: [
              {
                id: "agent-visible-second",
                type: "agentMessage",
                status: "completed",
                text: "second cached thread should be visible immediately",
              },
            ],
          },
        ],
      },
    },
  });

  await expect(
    page
      .getByTestId("chat-scroll-area")
      .getByText("second cached thread should be visible immediately"),
  ).toBeVisible();
});

test("live terminal event updates selected thread even when snapshot cursor is ahead", async ({
  page,
}) => {
  await openApp(page);
  const cursorThreadId = "e2e-terminal-cursor-thread";
  const turnId = "turn-terminal-cursor";
  const runningTurn = {
    id: turnId,
    status: "inProgress",
    items: [
      {
        id: "user-terminal-cursor",
        type: "userMessage",
        content: [{ type: "text", text: "cursor race request" }],
      },
    ],
  };
  const completedTurn = {
    ...runningTurn,
    status: "completed",
    items: [
      ...runningTurn.items,
      {
        id: "agent-terminal-cursor",
        type: "agentMessage",
        phase: "final_answer",
        text: "cursor race done",
      },
    ],
  };
  await seedGatewayThread(page, {
    projectId: 1,
    threadId: cursorThreadId,
    currentThread: { id: cursorThreadId, name: "Cursor Race Thread" },
    history: { thread: { id: cursorThreadId, turns: [runningTurn] } },
    status: "running",
    lastEventId: 10,
    threadViews: {
      "1:e2e-terminal-cursor-thread": {
        hostId: 1,
        projectId: 1,
        threadId: cursorThreadId,
        currentThread: { id: cursorThreadId, name: "Cursor Race Thread" },
        history: { thread: { id: cursorThreadId, turns: [runningTurn] } },
        events: [],
        olderTurnsCursor: null,
        newerTurnsCursor: null,
        lastEventId: 11,
        loading: false,
        error: null,
      },
    },
  });
  await receiveRealtimeThreadEvent(page, {
    id: 11,
    hostId: 1,
    threadId: cursorThreadId,
    method: "turn/completed",
    payload: {
      method: "turn/completed",
      params: { threadId: cursorThreadId, turn: completedTurn },
    },
    createdAt: new Date().toISOString(),
  });

  await expect(page.getByText("cursor race done")).toBeVisible();
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成");
});

test("context compaction duration survives event replay timing", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-context-compaction-thread";
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Context Compaction" },
    history: { thread: { id: threadId, turns: [] } },
    status: "running",
  });
  await applyGatewayLiveEvent(page, {
    id: 401,
    hostId: 1,
    threadId,
    method: "item/started",
    payload: {
      params: {
        threadId,
        turnId: "turn-context",
        item: {
          id: "context-compaction",
          type: "contextCompaction",
          status: "inProgress",
        },
      },
    },
    createdAt: "2026-07-02T10:00:00.000Z",
  });
  await applyGatewayLiveEvent(page, {
    id: 402,
    hostId: 1,
    threadId,
    method: "item/completed",
    payload: {
      params: {
        threadId,
        turnId: "turn-context",
        item: {
          id: "context-compaction",
          type: "contextCompaction",
          status: "completed",
        },
      },
    },
    createdAt: "2026-07-02T10:00:04.250Z",
  });

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  await expect(chatScrollArea.getByText("压缩上下文")).toBeVisible();
  await expect(chatScrollArea.getByText("4.25s")).toBeVisible();
  await expect(chatScrollArea.getByText("0.00s")).toBeHidden();
});

test("turn completed keeps thread running while context compaction is active", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-context-compaction-active-after-turn";
  const activeCompactionTurn = {
    id: "turn-context-active",
    status: "completed",
    items: [
      {
        id: "context-compaction-active",
        type: "contextCompaction",
        status: "inProgress",
        startedAt: "2026-07-02T10:00:00.000Z",
      },
    ],
  };

  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Active Context After Turn" },
    history: { thread: { id: threadId, turns: [] } },
    status: "running",
  });
  await applyGatewayLiveEvent(page, {
    id: 410,
    hostId: 1,
    threadId,
    method: "turn/completed",
    payload: {
      params: {
        threadId,
        turn: activeCompactionTurn,
      },
    },
    createdAt: "2026-07-02T10:00:01.000Z",
  });

  await expect.poll(() => selectedThreadStatusInStore(page)).toBe("running");
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "停止生成");
  await expect(page.getByText("压缩上下文")).toBeVisible();
});

test("restoring a cached thread uses app-server snapshot state for active context compaction", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-active-context-cache-thread";
  const activeContextHistory = {
    thread: {
      id: threadId,
      turns: [
        {
          id: "turn-context-running",
          status: "completed",
          items: [
            {
              id: "context-compaction-running",
              type: "contextCompaction",
              status: "inProgress",
              startedAt: "2026-07-02T10:00:00.000Z",
            },
          ],
        },
      ],
    },
  };
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Active Context Cache" },
    history: activeContextHistory,
    status: "completed",
  });
  await installRealtimeThreadSnapshotMock(page, {
    snapshots: {
      [threadId]: {
        thread: { id: threadId, name: "Active Context Cache", status: "running" },
        history: activeContextHistory,
        runtimeStatus: "running",
      },
    },
  });
  await cacheSelectedThreadAndOpenThread(page, {
    threadId,
    hostId: 1,
    otherThreadId: "e2e-other-thread",
    otherThreadName: "Other Thread",
  });

  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "停止生成");
  await expect(page.getByText("压缩上下文")).toBeVisible();
});
