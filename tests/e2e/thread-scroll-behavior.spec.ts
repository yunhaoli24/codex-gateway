import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";
import {
  appendAgentStreamLines,
  appendCommandOutputLines,
  appendFileDiffLines,
  completeTurnWithFinalAgentMessage,
  seedGatewayThread,
} from "./helpers/gateway-store";
import {
  captureTextAnchor,
  captureVisibleAgentLineAnchor,
  captureVisibleTextAnchor,
  chatViewportBottomDistance,
  chatViewportScrollTop,
  commandOutputScrollTop,
  detachChatViewportNearBottom,
  parkChatViewportInMiddle,
  parkCommandOutputInMiddle,
  scrollChatViewportToBottom,
  scrollChatViewportToTop,
  visibleAgentLineTop,
  visibleTextTop,
} from "./helpers/scroll";

test("opened threads render two turns first and then top up to five turns", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-background-turn-top-up-thread";
  const httpTurnsRequests = trackThreadTurnsHttpRequests(page);
  await installImmediateThreadTurnsLoadStub(page, {
    type: "thread.turns.page",
    requestId: "e2e-thread-turns-page",
    hostId: 1,
    threadId,
    history: { thread: { id: threadId, turns: buildTextTurns(1, 3, "background turn") } },
    turnsPage: { nextCursor: null, backwardsCursor: null },
  });

  await seedGatewayThread(page, {
    projectId: 1,
    threadId,
    currentThread: { id: threadId, name: "Background Turn Top Up" },
    olderTurnsCursor: JSON.stringify({ turnId: "turn-004", includeAnchor: false }),
    history: {
      thread: {
        id: threadId,
        turns: buildTextTurns(4, 5, "background turn"),
      },
    },
  });

  await expect(page.getByText("background turn 004")).toBeVisible();
  await expect(page.getByText("background turn 005")).toBeVisible();
  await expect.poll(() => threadTurnCount(page)).toBe(5);
  const requests = await threadTurnsLoadRequests(page);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ type: "thread.turns.load", limit: 3 });
  expect(httpTurnsRequests()).toBe(0);
});

test("streaming output stays pinned when the user is already at the latest content", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-pinned-stream-thread";
  const agentLines = Array.from(
    { length: 90 },
    (_, index) => `pinned stream line ${String(index + 1).padStart(3, "0")}`,
  );
  await seedGatewayThread(page, {
    projectId: 1,
    threadId,
    currentThread: { id: threadId, name: "Pinned Stream" },
    status: "running",
    history: {
      thread: {
        id: threadId,
        turns: [
          {
            id: "turn-pinned-1",
            status: "running",
            items: [
              {
                id: "user-pinned-1",
                type: "userMessage",
                content: [{ type: "text", text: "stream while pinned" }],
              },
              {
                id: "agent-pinned-1",
                type: "agentMessage",
                status: "inProgress",
                text: agentLines.join("\n\n"),
              },
            ],
          },
        ],
      },
    },
  });

  await expect(page.getByText("pinned stream line 090")).toBeVisible();
  await scrollChatViewportToBottom(page);
  await expect(page.getByTestId("chat-scroll-area")).toHaveAttribute("data-follow-latest", "true");

  for (let batch = 0; batch < 4; batch += 1) {
    await appendAgentStreamLines(page, {
      itemId: "agent-pinned-1",
      prefix: `pinned appended batch ${batch + 1}`,
      count: 8,
    });
    await expect.poll(() => chatViewportBottomDistance(page)).toBeLessThanOrEqual(2);
  }
});

test("switching threads discards stale virtual row measurements", async ({ page }) => {
  await openApp(page);
  const longThreadId = "e2e-long-measure-thread";
  const shortThreadId = "e2e-short-measure-thread";
  await seedGatewayThread(page, {
    hostId: 1,
    projectId: 1,
    threadId: longThreadId,
    currentThread: { id: longThreadId, name: "Long Measure" },
    threads: [
      {
        id: longThreadId,
        name: "Long Measure",
        pinned: false,
        updatedAt: Math.floor(Date.now() / 1000),
      },
      {
        id: shortThreadId,
        name: "Short Measure",
        pinned: false,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    ],
    threadViews: {
      "1:e2e-long-measure-thread": {
        hostId: 1,
        projectId: 1,
        threadId: longThreadId,
        currentThread: { id: longThreadId, name: "Long Measure" },
        history: {
          thread: {
            id: longThreadId,
            turns: buildMeasuredTurns(longThreadId, 80),
          },
        },
        events: [],
        olderTurnsCursor: null,
        newerTurnsCursor: null,
        lastEventId: 0,
        loading: false,
        error: null,
      },
      "1:e2e-short-measure-thread": {
        hostId: 1,
        projectId: 1,
        threadId: shortThreadId,
        currentThread: { id: shortThreadId, name: "Short Measure" },
        history: {
          thread: {
            id: shortThreadId,
            turns: buildMeasuredTurns(shortThreadId, 3),
          },
        },
        events: [],
        olderTurnsCursor: null,
        newerTurnsCursor: null,
        lastEventId: 0,
        loading: false,
        error: null,
      },
    },
    history: {
      thread: {
        id: longThreadId,
        turns: buildMeasuredTurns(longThreadId, 80),
      },
    },
  });

  await page.getByTestId(`thread-button-${shortThreadId}`).click();
  await expect(page.getByText("e2e-short-measure-thread line 003")).toBeVisible();
  await expect.poll(() => visibleTimelineRowsDoNotOverlap(page)).toBe(true);

  await page.getByTestId(`thread-button-${longThreadId}`).click();
  await expect(page.getByText("e2e-long-measure-thread line 080")).toBeVisible();
  await expect.poll(() => visibleTimelineRowsDoNotOverlap(page)).toBe(true);
});

function buildMeasuredTurns(threadId: string, lineCount: number) {
  return [
    {
      id: "same-turn-id",
      status: "completed",
      items: [
        {
          id: `${threadId}-user`,
          type: "userMessage",
          content: [{ type: "text", text: `open ${threadId}` }],
        },
        {
          id: `${threadId}-agent`,
          type: "agentMessage",
          phase: "final_answer",
          text: Array.from(
            { length: lineCount },
            (_, index) => `${threadId} line ${String(index + 1).padStart(3, "0")}`,
          ).join("\n\n"),
        },
      ],
    },
  ];
}

async function visibleTimelineRowsDoNotOverlap(page: Page) {
  return await page.getByTestId("chat-scroll-area").evaluate((root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]');
    if (!viewport) throw new Error("Missing chat viewport");
    const viewportBox = viewport.getBoundingClientRect();
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-row-key]"))
      .map((row) => row.getBoundingClientRect())
      .filter((box) => box.bottom > viewportBox.top && box.top < viewportBox.bottom)
      .sort((a, b) => a.top - b.top);
    return rows.every((box, index) => index === 0 || box.top >= rows[index - 1]!.bottom - 1);
  });
}

test("streaming output does not force scroll when the user is reading earlier content", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-scroll-anchor-thread";
  const agentLines = Array.from(
    { length: 140 },
    (_, index) => `agent loop line ${String(index + 1).padStart(3, "0")}`,
  );
  const commandLines = Array.from(
    { length: 90 },
    (_, index) => `command output line ${String(index + 1).padStart(3, "0")}`,
  );
  const diffLines = [
    "diff --git a/src/stream.py b/src/stream.py",
    "index 1111111..2222222 100644",
    "--- a/src/stream.py",
    "+++ b/src/stream.py",
    "@@ -1,40 +1,40 @@",
    ...Array.from(
      { length: 80 },
      (_, index) => ` line_${String(index + 1).padStart(3, "0")} = ${index}`,
    ),
  ];
  await seedGatewayThread(page, {
    projectId: 1,
    threadId,
    currentThread: { id: threadId, name: "Scroll Anchor" },
    status: "running",
    history: {
      thread: {
        id: threadId,
        turns: [
          {
            id: "turn-scroll-1",
            status: "running",
            items: [
              {
                id: "user-scroll-1",
                type: "userMessage",
                content: [{ type: "text", text: "produce a long stream" }],
              },
              {
                id: "agent-scroll-1",
                type: "agentMessage",
                status: "inProgress",
                text: agentLines.join("\n\n"),
              },
              {
                id: "command-scroll-1",
                type: "commandExecution",
                status: "running",
                command: "node long-output.js",
                aggregatedOutput: commandLines.join("\n"),
              },
              {
                id: "file-scroll-1",
                type: "fileChange",
                status: "running",
                changes: [{ path: "src/stream.py", kind: "update", diff: diffLines.join("\n") }],
              },
            ],
          },
        ],
      },
    },
  });

  await expect(page.getByText("agent loop line 140")).toBeVisible();
  const nearBottomScrollTop = await detachChatViewportNearBottom(page);
  await expect(page.getByTestId("chat-scroll-area")).toHaveAttribute("data-follow-latest", "false");
  await appendAgentStreamLines(page, {
    itemId: "agent-scroll-1",
    prefix: "near-bottom stream line",
    count: 30,
  });
  await page.waitForTimeout(300);
  await expect
    .poll(() => chatViewportScrollTop(page))
    .toBeGreaterThanOrEqual(nearBottomScrollTop - 2);
  await expect.poll(() => chatViewportScrollTop(page)).toBeLessThanOrEqual(nearBottomScrollTop + 2);

  const mainScrollTop = await parkChatViewportInMiddle(page);
  await expect(page.getByTestId("chat-scroll-area")).toHaveAttribute("data-follow-latest", "false");
  const visibleAnchor = await captureVisibleAgentLineAnchor(page);

  await appendAgentStreamLines(page, {
    itemId: "agent-scroll-1",
    prefix: "new agent stream line",
    count: 40,
  });

  await page.waitForTimeout(300);
  await expect.poll(() => chatViewportScrollTop(page)).toBeGreaterThanOrEqual(mainScrollTop - 2);
  await expect.poll(() => chatViewportScrollTop(page)).toBeLessThanOrEqual(mainScrollTop + 2);
  await expect
    .poll(() => visibleAgentLineTop(page, visibleAnchor.text))
    .toBeGreaterThanOrEqual(visibleAnchor.top - 2);
  await expect
    .poll(() => visibleAgentLineTop(page, visibleAnchor.text))
    .toBeLessThanOrEqual(visibleAnchor.top + 2);

  const beforeDiffGrowthScrollTop = await chatViewportScrollTop(page);
  await appendFileDiffLines(page, {
    itemId: "file-scroll-1",
    path: "src/stream.py",
    prefix: "new diff stream line",
    count: 60,
  });

  await page.waitForTimeout(300);
  await expect
    .poll(() => chatViewportScrollTop(page))
    .toBeGreaterThanOrEqual(beforeDiffGrowthScrollTop - 2);
  await expect
    .poll(() => chatViewportScrollTop(page))
    .toBeLessThanOrEqual(beforeDiffGrowthScrollTop + 2);
  await expect
    .poll(() => visibleAgentLineTop(page, visibleAnchor.text))
    .toBeGreaterThanOrEqual(visibleAnchor.top - 2);
  await expect
    .poll(() => visibleAgentLineTop(page, visibleAnchor.text))
    .toBeLessThanOrEqual(visibleAnchor.top + 2);

  await scrollChatViewportToBottom(page);
  await expect(page.getByRole("button", { name: /node long-output\.js/ })).toBeVisible();
  await page.getByRole("button", { name: /node long-output\.js/ }).click();
  const commandScrollTop = await parkCommandOutputInMiddle(page);
  await appendCommandOutputLines(page, {
    itemId: "command-scroll-1",
    prefix: "new command output line",
    count: 40,
  });

  await page.waitForTimeout(300);
  await expect
    .poll(() => commandOutputScrollTop(page))
    .toBeGreaterThanOrEqual(commandScrollTop - 2);
  await expect.poll(() => commandOutputScrollTop(page)).toBeLessThanOrEqual(commandScrollTop + 2);
});

test("completed turns do not collapse intermediate steps while the user is detached", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-detached-collapse-thread";
  const agentLines = Array.from(
    { length: 150 },
    (_, index) => `collapse anchor line ${String(index + 1).padStart(3, "0")}`,
  );
  await seedGatewayThread(page, {
    projectId: 1,
    threadId,
    currentThread: { id: threadId, name: "Detached Collapse" },
    status: "running",
    history: {
      thread: {
        id: threadId,
        turns: [
          {
            id: "turn-collapse-1",
            status: "running",
            items: [
              {
                id: "user-collapse-1",
                type: "userMessage",
                content: [{ type: "text", text: "produce a long intermediate stream" }],
              },
              {
                id: "agent-collapse-1",
                type: "agentMessage",
                status: "inProgress",
                text: agentLines.join("\n\n"),
              },
            ],
          },
        ],
      },
    },
  });

  await expect(page.getByText("collapse anchor line 150")).toBeVisible();
  await parkChatViewportInMiddle(page);
  const visibleAnchor = await captureVisibleTextAnchor(page, "collapse anchor line ");

  await completeTurnWithFinalAgentMessage(page, {
    agentItemId: "agent-collapse-1",
    finalItemId: "agent-collapse-final",
    finalText: "final answer after intermediate work",
  });

  await expect(page.getByTestId("intermediate-steps")).toBeVisible();
  await expect(page.getByText(visibleAnchor.text)).toBeVisible();
  await page.waitForTimeout(300);
  await expect
    .poll(() => visibleTextTop(page, visibleAnchor.text))
    .toBeGreaterThanOrEqual(visibleAnchor.top - 2);
  await expect
    .poll(() => visibleTextTop(page, visibleAnchor.text))
    .toBeLessThanOrEqual(visibleAnchor.top + 2);

  await scrollChatViewportToBottom(page);
  await expect(page.getByTestId("intermediate-steps")).toBeHidden();
});

test("manually expanded completed intermediate steps stay open after returning to bottom", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-manual-intermediate-open-thread";
  const intermediateLines = Array.from(
    { length: 140 },
    (_, index) => `manual intermediate line ${String(index + 1).padStart(3, "0")}`,
  );
  await seedGatewayThread(page, {
    projectId: 1,
    threadId,
    currentThread: { id: threadId, name: "Manual Intermediate Open" },
    status: "completed",
    history: {
      thread: {
        id: threadId,
        turns: [
          {
            id: "turn-manual-intermediate-open",
            status: "completed",
            items: [
              {
                id: "user-manual-intermediate-open",
                type: "userMessage",
                content: [{ type: "text", text: "produce intermediate content" }],
              },
              {
                id: "agent-manual-intermediate-open",
                type: "agentMessage",
                status: "completed",
                text: intermediateLines.join("\n\n"),
              },
              {
                id: "agent-manual-intermediate-final",
                type: "agentMessage",
                phase: "final_answer",
                status: "completed",
                text: "final answer after manual intermediate expansion",
              },
            ],
          },
        ],
      },
    },
  });

  const toggle = page.getByRole("button", { name: /中间过程/ }).first();
  await expect(toggle).toHaveAttribute("data-state", "closed");
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("intermediate-steps")).toBeVisible();

  await parkChatViewportInMiddle(page);
  await scrollChatViewportToBottom(page);

  await expect(toggle).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("intermediate-steps")).toBeVisible();
});

test("loading older turns prepends history without moving the current viewport anchor", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-load-older-anchor-thread";
  const httpTurnsRequests = trackThreadTurnsHttpRequests(page);
  await installDeferredThreadTurnsLoadStub(page, {
    type: "thread.turns.page",
    requestId: "e2e-thread-turns-page",
    hostId: 1,
    threadId,
    history: { thread: { id: threadId, turns: buildTextTurns(1, 5, "anchored turn") } },
    turnsPage: { nextCursor: null, backwardsCursor: null },
  });
  await seedGatewayThread(page, {
    projectId: 1,
    threadId,
    currentThread: { id: threadId, name: "Load Older Anchor" },
    olderTurnsCursor: JSON.stringify({ turnId: "turn-006", includeAnchor: false }),
    history: {
      thread: {
        id: threadId,
        turns: buildTextTurns(6, 10, "anchored turn"),
      },
    },
  });

  await scrollChatViewportToTop(page);
  await expect
    .poll(() => threadTurnsLoadRequests(page).then((requests) => requests.length))
    .toBe(1);
  const anchor = await captureTextAnchor(page, "anchored turn 006");
  await releaseDeferredThreadTurnsLoad(page);

  await expect.poll(() => threadTurnCount(page)).toBe(10);
  await page.waitForTimeout(300);
  await expect.poll(() => visibleTextTop(page, anchor.text)).toBeGreaterThanOrEqual(anchor.top - 2);
  await expect.poll(() => visibleTextTop(page, anchor.text)).toBeLessThanOrEqual(anchor.top + 2);
  expect(httpTurnsRequests()).toBe(0);
});

function buildTextTurns(start: number, end: number, prefix: string) {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const number = start + index;
    const label = String(number).padStart(3, "0");
    return {
      id: `turn-${label}`,
      status: "completed",
      items: [
        {
          id: `agent-${label}`,
          type: "agentMessage",
          phase: "final_answer",
          status: "completed",
          text: `${prefix} ${label}`,
        },
      ],
    };
  });
}

async function threadTurnCount(page: import("@playwright/test").Page) {
  return await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    return store.history?.thread?.turns?.length ?? 0;
  });
}

function trackThreadTurnsHttpRequests(page: Page) {
  let count = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/threads/turns") {
      count += 1;
    }
  });
  return () => count;
}

async function installImmediateThreadTurnsLoadStub(page: Page, response: unknown) {
  await installThreadTurnsLoadStub(page, response, false);
}

async function installDeferredThreadTurnsLoadStub(page: Page, response: unknown) {
  await installThreadTurnsLoadStub(page, response, true);
}

async function installThreadTurnsLoadStub(page: Page, response: unknown, deferred: boolean) {
  await page.evaluate(
    ({ response, deferred }) => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const realtime = app?.config?.globalProperties?.$pinia?._s?.get("gateway-realtime");
      if (!realtime) {
        throw new Error("Unable to locate gateway realtime Pinia store");
      }
      const original = realtime.request.bind(realtime);
      (window as any).__threadTurnsLoadRequests = [];
      if (deferred) {
        (window as any).__threadTurnsLoadResponse = response;
        (window as any).__threadTurnsLoadPromise = new Promise((resolve) => {
          (window as any).__releaseThreadTurnsLoad = () =>
            resolve((window as any).__threadTurnsLoadResponse);
        });
      }
      let requestSequence = 0;
      realtime.request = async (buildMessage: (requestId: string) => any, timeoutMs?: number) => {
        requestSequence += 1;
        const requestId = `e2e-thread-turns-${requestSequence}`;
        const request = buildMessage(requestId);
        if (request?.type !== "thread.turns.load") {
          return original(buildMessage, timeoutMs);
        }
        (window as any).__threadTurnsLoadRequests.push(request);
        return deferred ? await (window as any).__threadTurnsLoadPromise : response;
      };
    },
    { response, deferred },
  );
}

async function releaseDeferredThreadTurnsLoad(page: Page) {
  await page.evaluate(() => {
    const release = (window as any).__releaseThreadTurnsLoad;
    if (typeof release !== "function") {
      throw new Error("Missing deferred thread turns release callback");
    }
    release();
  });
}

async function threadTurnsLoadRequests(page: Page) {
  return await page.evaluate(() => (window as any).__threadTurnsLoadRequests ?? []);
}
