import { expect, test } from "@playwright/test";
import { E2E_USERNAME, openApp } from "./helpers/app";
import { gatewayEventFromNotification } from "./helpers/canonical-event";
import {
  applyGatewayLiveEvent,
  cacheSelectedThreadAndOpenThread,
  installRealtimeThreadSnapshotMock,
  openThreadInStore,
  receiveRealtimeThreadEvent,
  seedGatewayThread,
  selectedThreadStatusInStore,
} from "./helpers/gateway-store";
import { defaultGatewayProject } from "./fixtures/thread-history";
import { gatewayThreadFixture } from "./fixtures/gateway-thread";
import { appServerTurnFixture } from "./fixtures/app-server-turn";
import { z } from "zod";

const storedRouteSelectionSchema = z.object({
  hostId: z.number().nullable(),
  projectId: z.number().nullable(),
  threadId: z.string().nullable(),
});

test("opening completed history does not show fake thinking", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-completed-thread";
  const startedEvent = gatewayEventFromNotification({
    id: 1,
    threadId,
    method: "turn/started",
    params: { threadId, turn: appServerTurnFixture({ id: "turn-1" }) },
    createdAt: "2026-07-02T10:00:00.000Z",
  });
  const completedTurn = appServerTurnFixture({
    id: "turn-1",
    status: "completed",
    startedAt: 1_782_986_400,
    completedAt: 1_782_986_402.5,
    durationMs: 2_500,
    items: [
      {
        id: "user-1",
        type: "userMessage",
        content: [{ type: "text", text: "completed history" }],
      },
      {
        id: "reasoning-1",
        type: "reasoning",
        status: "completed",
        summary: ["intermediate work"],
      },
      {
        id: "agent-1",
        type: "agentMessage",
        phase: "final_answer",
        text: "done",
      },
    ],
  });
  const completedEvent = gatewayEventFromNotification({
    id: 4,
    threadId,
    method: "turn/completed",
    params: { threadId, turn: completedTurn },
    createdAt: "2026-07-02T10:00:01.000Z",
  });
  const usageEvents = [
    { responseId: "response-1", amount: "0.0012" },
    { responseId: "response-2", amount: "0.0034" },
  ].map(({ responseId, amount }, index) =>
    gatewayEventFromNotification({
      id: index + 2,
      threadId,
      method: "rawResponse/completed",
      params: {
        threadId,
        turnId: "turn-1",
        responseId,
        usage: null,
        usageMetadata: { amount, metadata: null },
      },
      createdAt: `2026-07-02T10:00:0${index + 1}.000Z`,
    }),
  );
  const activeTurn = appServerTurnFixture({
    ...completedTurn,
    status: "inProgress",
    completedAt: null,
    durationMs: null,
  });
  await seedGatewayThread(page, {
    projectId: 1,
    threadId,
    currentThread: { id: threadId, name: "Completed UI", status: { type: "idle" } },
    history: { thread: { id: threadId, turns: [activeTurn] } },
    events: [startedEvent],
    loading: true,
    status: "running",
  });

  await expect(page.getByText("completed history")).toBeVisible();
  await expect(page.getByRole("button", { name: /中间过程/ })).toHaveAttribute(
    "data-state",
    "open",
  );
  await expect(page.getByTestId("agent-message-actions")).toHaveCount(0);
  await expect(page.getByText(/本轮用时/)).toHaveCount(0);

  for (const usageEvent of usageEvents) await applyGatewayLiveEvent(page, usageEvent);
  await applyGatewayLiveEvent(page, completedEvent);

  await expect(page.getByRole("button", { name: /中间过程/ })).toHaveAttribute(
    "data-state",
    "closed",
  );
  const agentActions = page.getByTestId("agent-message-actions");
  await expect(agentActions).toBeAttached();
  await page.getByText("done", { exact: true }).hover();
  await expect
    .poll(() => agentActions.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
  await expect(agentActions.getByText("本轮用时 2.50s")).toBeVisible();
  await expect(agentActions.getByText("用量 0.0046")).toBeVisible();
  await expect(agentActions.getByRole("button", { name: "复制输出" })).toBeAttached();
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
  const staleTurn = appServerTurnFixture({
    id: "turn-stale-1",
    status: "inProgress",
    items: [
      {
        id: "user-stale-1",
        type: "userMessage",
        content: [{ type: "text", text: "stale cached request" }],
      },
    ],
  });
  const completedTurn = appServerTurnFixture({
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
  });

  await installRealtimeThreadSnapshotMock(page, {
    snapshots: {
      [threadId]: {
        thread: { id: threadId, name: "Cached Terminal Thread" },
        history: { thread: { id: threadId, turns: [completedTurn] } },
        threadSettings: {},
        tokenUsage: null,
        projectId: 1,
        project: defaultGatewayProject(),
        turnsPage: { nextCursor: null, backwardsCursor: null },
        recentEvents: [
          gatewayEventFromNotification({
            id: 1,
            threadId,
            method: "turn/completed",
            params: { threadId, turn: completedTurn },
          }),
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
        project: defaultGatewayProject(),
      },
    },
  });
  await seedGatewayThread(page, { projectId: 1, threadId: null });

  await openThreadInStore(page, { threadId, hostId: 1, projectId: 1 });

  await expect
    .poll(async () => {
      const stored = await page.evaluate(
        (username) =>
          localStorage.getItem(`codex-gateway:${encodeURIComponent(username)}:last-open-thread`),
        E2E_USERNAME,
      );
      return stored === null ? null : storedRouteSelectionSchema.parse(JSON.parse(stored));
    })
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
  const runningTurn = appServerTurnFixture({
    id: turnId,
    status: "inProgress",
    items: [
      {
        id: "user-terminal-cursor",
        type: "userMessage",
        content: [{ type: "text", text: "cursor race request" }],
      },
    ],
  });
  const completedTurn = appServerTurnFixture({
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
  });
  await seedGatewayThread(page, {
    projectId: 1,
    threadId: cursorThreadId,
    currentThread: { id: cursorThreadId, name: "Cursor Race Thread" },
    history: { thread: { id: cursorThreadId, turns: [runningTurn] } },
    status: "running",
    lastEventId: 10,
    eventEpoch: "e2e-event-epoch",
    threadViews: {
      "1:e2e-terminal-cursor-thread": {
        hostId: 1,
        projectId: 1,
        threadId: cursorThreadId,
        currentThread: gatewayThreadFixture(
          { id: cursorThreadId, name: "Cursor Race Thread" },
          { projectId: 1 },
        ),
        history: { thread: { id: cursorThreadId, turns: [runningTurn] } },
        events: [],
        olderTurnsCursor: null,
        newerTurnsCursor: null,
        lastEventId: 11,
        eventEpoch: "e2e-event-epoch",
        loading: false,
        error: null,
      },
    },
  });
  await receiveRealtimeThreadEvent(
    page,
    gatewayEventFromNotification({
      id: 11,
      threadId: cursorThreadId,
      method: "turn/completed",
      params: { threadId: cursorThreadId, turn: completedTurn },
    }),
  );

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
  await applyGatewayLiveEvent(
    page,
    gatewayEventFromNotification({
      id: 401,
      threadId,
      method: "item/started",
      params: {
        threadId,
        turnId: "turn-context",
        startedAtMs: Date.parse("2026-07-02T10:00:00.000Z"),
        item: {
          id: "context-compaction",
          type: "contextCompaction",
          status: "inProgress",
        },
      },
      createdAt: "2026-07-02T10:00:02.000Z",
    }),
  );
  await applyGatewayLiveEvent(
    page,
    gatewayEventFromNotification({
      id: 402,
      threadId,
      method: "item/completed",
      params: {
        threadId,
        turnId: "turn-context",
        completedAtMs: Date.parse("2026-07-02T10:00:04.250Z"),
        item: {
          id: "context-compaction",
          type: "contextCompaction",
          status: "completed",
        },
      },
      createdAt: "2026-07-02T10:00:09.000Z",
    }),
  );

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  await expect(chatScrollArea.getByText("压缩上下文")).toBeVisible();
  await expect(chatScrollArea.getByText("4.25s")).toBeVisible();
  await expect(chatScrollArea.getByText("0.00s")).toBeHidden();
});

test("turn completed keeps thread running while context compaction is active", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-context-compaction-active-after-turn";
  const activeCompactionTurn = appServerTurnFixture({
    id: "turn-context-active",
    status: "completed",
    items: [
      {
        id: "context-compaction-active",
        type: "contextCompaction",
        status: "inProgress",
        startedAt: Date.parse("2026-07-02T10:00:00.000Z"),
      },
    ],
  });

  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Active Context After Turn" },
    history: { thread: { id: threadId, turns: [] } },
    status: "running",
  });
  await applyGatewayLiveEvent(
    page,
    gatewayEventFromNotification({
      id: 410,
      threadId,
      method: "turn/completed",
      params: {
        threadId,
        turn: activeCompactionTurn,
      },
      createdAt: "2026-07-02T10:00:01.000Z",
    }),
  );

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
              startedAt: Date.parse("2026-07-02T10:00:00.000Z"),
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
        thread: {
          id: threadId,
          name: "Active Context Cache",
          status: { type: "active", activeFlags: [] },
        },
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
