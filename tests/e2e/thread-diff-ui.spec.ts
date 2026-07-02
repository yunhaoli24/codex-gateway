import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";
import { installRealtimeThreadSnapshotMock, seedGatewayThread } from "./helpers/gateway-store";

test("file diff blocks can collapse and expand after virtual timeline measurement", async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-diff-thread";
    const diff = [
      "diff --git a/src/example.py b/src/example.py",
      "index 1111111..2222222 100644",
      "--- a/src/example.py",
      "+++ b/src/example.py",
      "@@ -1,2 +1,3 @@",
      " print('before')",
      "-old_value = 'short'",
      "+new_value = 'this is a deliberately long changed line to require horizontal scrolling in the diff viewport'",
      "+print(new_value)",
    ].join("\n");

    store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.projects = [{ id: 1, hostId: 1, name: "E2E Project", remotePath: "/tmp/e2e" }];
    store.selectedHostId = 1;
    store.selectedProjectId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Diff UI" };
    store.history = {
      thread: {
        id: threadId,
        turns: [
          {
            id: "turn-1",
            status: "running",
            items: [
              {
                id: "user-1",
                type: "userMessage",
                content: [{ type: "text", text: "edit a file" }],
              },
              {
                id: "file-change-1",
                type: "fileChange",
                status: "completed",
                changes: [{ path: "src/example.py", kind: "update", diff }],
              },
            ],
          },
        ],
      },
    };
    store.initializing = false;
    store.loading = false;
  });

  const toggle = page.getByRole("button", { name: /src\/example\.py/ });
  const diffText = page.getByText("new_value =");
  await expect(toggle).toHaveAttribute("data-state", "open");
  await expect(diffText).toBeVisible();
  await expect
    .poll(async () => (await page.locator(".diff-markdown").first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(24);

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "closed");
  await expect(diffText).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "open");
  await expect(diffText).toBeVisible();
});

test("opening completed history does not show fake thinking", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-completed-thread";
    const startedEvent = {
      id: 1,
      hostId: 1,
      threadId,
      method: "turn/started",
      payload: { params: { threadId, turn: { id: "turn-1", status: "running", items: [] } } },
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
    };

    store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.projects = [{ id: 1, hostId: 1, name: "E2E Project", remotePath: "/tmp/e2e" }];
    store.selectedHostId = 1;
    store.selectedProjectId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Completed UI", status: "completed" };
    store.history = { thread: { id: threadId, turns: [completedTurn] } };
    store.events = [startedEvent, completedEvent];
    store.initializing = false;
    store.loading = true;
    for (const event of store.events) {
      store.applyLiveEvent(event);
    }
    store.setThreadStatus(1, threadId, "completed");
  });

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
  await page.route("**/api/config/sync", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 1,
        hosts: [],
        projects: [],
        pinnedThreads: [],
        lastOpenThread: { hostId: 1, projectId: 1, threadId },
      }),
    });
  });

  await page.evaluate(async (targetThreadId) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.hosts = [
      {
        id: 1,
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
    store.projects = [{ id: 1, hostId: 1, name: "E2E Project", remotePath: "/tmp/e2e" }];
    store.initializing = false;
    await store.openThread(targetThreadId, { hostId: 1, projectId: 1 });
  }, threadId);

  await expect(page.getByText("cached turn is done")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
        const pinia = app?.config?.globalProperties?.$pinia;
        const store = pinia?._s?.get("gateway");
        return store?.selectedThreadStatus;
      }),
    )
    .toBe("completed");
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成");
});

test("live terminal event updates selected thread even when snapshot cursor is ahead", async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-terminal-cursor-thread";
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

    store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.projects = [{ id: 1, hostId: 1, name: "E2E Project", remotePath: "/tmp/e2e" }];
    store.selectedHostId = 1;
    store.selectedProjectId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Cursor Race Thread" };
    store.history = { thread: { id: threadId, turns: [runningTurn] } };
    store.events = [];
    store.lastEventId = 10;
    store.threadSnapshots["1:e2e-terminal-cursor-thread"] = {
      hostId: 1,
      projectId: 1,
      threadId,
      currentThread: store.currentThread,
      history: store.history,
      events: [],
      olderTurnsCursor: null,
      newerTurnsCursor: null,
      lastEventId: 11,
    };
    store.initializing = false;
    store.loading = false;
    store.setThreadStatus(1, threadId, "running", { turnId });
    store.handleRealtimeMessage({
      type: "thread.event",
      event: {
        id: 11,
        hostId: 1,
        threadId,
        method: "turn/completed",
        payload: {
          method: "turn/completed",
          params: { threadId, turn: completedTurn },
        },
        createdAt: new Date().toISOString(),
      },
    });
  });

  await expect(page.getByText("cursor race done")).toBeVisible();
  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "已完成");
});

test("streaming output does not force scroll when the user is reading earlier content", async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    const store = (() => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      const value = pinia?._s?.get("gateway");
      if (!value) {
        throw new Error("Unable to locate gateway Pinia store");
      }
      return value;
    })();
    const threadId = "e2e-scroll-anchor-thread";
    const agentLines = Array.from(
      { length: 140 },
      (_, index) => `agent loop line ${String(index + 1).padStart(3, "0")}`,
    );
    const commandLines = Array.from(
      { length: 90 },
      (_, index) => `command output line ${String(index + 1).padStart(3, "0")}`,
    );

    store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.projects = [{ id: 1, hostId: 1, name: "E2E Project", remotePath: "/tmp/e2e" }];
    store.selectedHostId = 1;
    store.selectedProjectId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Scroll Anchor" };
    store.history = {
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
            ],
          },
        ],
      },
    };
    store.initializing = false;
    store.loading = false;
  });

  await expect(page.getByText("agent loop line 140")).toBeVisible();
  const mainScrollTop = await parkChatViewportInMiddle(page);

  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const turn = store.history.thread.turns[0];
    const agent = turn.items.find((item: any) => item.id === "agent-scroll-1");
    agent.text +=
      "\n\n" +
      Array.from(
        { length: 40 },
        (_, index) => `new agent stream line ${String(index + 1).padStart(3, "0")}`,
      ).join("\n\n");
    store.history = { thread: { ...store.history.thread, turns: [...store.history.thread.turns] } };
  });

  await page.waitForTimeout(300);
  await expect.poll(() => chatViewportScrollTop(page)).toBeGreaterThanOrEqual(mainScrollTop - 2);
  await expect.poll(() => chatViewportScrollTop(page)).toBeLessThanOrEqual(mainScrollTop + 2);

  await scrollChatViewportToBottom(page);
  await expect(page.getByRole("button", { name: /node long-output\.js/ })).toBeVisible();
  await page.getByRole("button", { name: /node long-output\.js/ }).click();
  const commandScrollTop = await parkCommandOutputInMiddle(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const turn = store.history.thread.turns[0];
    const command = turn.items.find((item: any) => item.id === "command-scroll-1");
    command.aggregatedOutput +=
      "\n" +
      Array.from(
        { length: 40 },
        (_, index) => `new command output line ${String(index + 1).padStart(3, "0")}`,
      ).join("\n");
    store.history = { thread: { ...store.history.thread, turns: [...store.history.thread.turns] } };
  });

  await page.waitForTimeout(300);
  await expect
    .poll(() => commandOutputScrollTop(page))
    .toBeGreaterThanOrEqual(commandScrollTop - 2);
  await expect.poll(() => commandOutputScrollTop(page)).toBeLessThanOrEqual(commandScrollTop + 2);
});

test("short command output uses natural height instead of a fixed minimum", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-short-command-output-thread";
    store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.selectedHostId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Short Command Output" };
    store.history = {
      thread: {
        id: threadId,
        turns: [
          {
            id: "turn-short-command",
            status: "running",
            items: [
              {
                id: "command-short-1",
                type: "commandExecution",
                status: "completed",
                command: "pwd",
                aggregatedOutput: "/tmp/e2e\n",
              },
            ],
          },
        ],
      },
    };
    store.initializing = false;
    store.loading = false;
  });

  await page.getByRole("button", { name: /pwd/ }).click();
  await expect(page.getByText("/tmp/e2e")).toBeVisible();
  await expect
    .poll(async () =>
      page.getByText("/tmp/e2e").evaluate((element: HTMLElement) => {
        const scrollArea = element.closest('[data-slot="scroll-area"]') as HTMLElement | null;
        if (!scrollArea) throw new Error("Missing command output scroll area");
        return scrollArea.getBoundingClientRect().height;
      }),
    )
    .toBeLessThan(96);
});

test("dynamic tool response submits through the server request responder and surfaces failures", async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-dynamic-tool-thread";
    store.hosts = [{ id: 7, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.projects = [{ id: 3, hostId: 7, name: "E2E Project", remotePath: "/tmp/e2e" }];
    store.selectedHostId = 7;
    store.selectedProjectId = 3;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Dynamic Tool" };
    store.history = {
      thread: {
        id: threadId,
        turns: [
          {
            id: "turn-dynamic-tool",
            status: "running",
            items: [
              {
                id: "server-request-42",
                type: "dynamicToolClientRequest",
                turnId: "turn-dynamic-tool",
                status: "waitingForClient",
                requestId: 42,
                method: "item/tool/call",
                params: {
                  namespace: "codex_app",
                  tool: "read_thread_terminal",
                  arguments: {},
                },
              },
            ],
          },
        ],
      },
    };
    store.initializing = false;
    store.loading = false;
  });

  await page.evaluate(() => {
    (window as any).__submittedServerRequest = null;
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    store.respondToServerRequest = async (
      hostId: number,
      threadId: string,
      requestId: string | number,
      result: unknown,
    ) => {
      (window as any).__submittedServerRequest = { hostId, threadId, requestId, result };
    };
  });

  await page.getByTestId("dynamic-tool-submit").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__submittedServerRequest))
    .toMatchObject({
      hostId: 7,
      threadId: "e2e-dynamic-tool-thread",
      requestId: 42,
      result: {
        contentItems: [{ type: "inputText", text: "" }],
        success: true,
      },
    });

  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    store.respondToServerRequest = async () => {
      throw new Error("pending app-server request was not found");
    };
  });

  await page.getByTestId("dynamic-tool-submit").click();
  await expect(
    page.getByTestId("chat-scroll-area").getByText("pending app-server request was not found"),
  ).toBeVisible();

  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    store.applyLiveEvent({
      id: 43,
      hostId: 7,
      threadId: "e2e-dynamic-tool-thread",
      method: "serverRequest/resolved",
      payload: { params: { threadId: "e2e-dynamic-tool-thread", requestId: 42 } },
      createdAt: new Date().toISOString(),
    });
  });
  await expect(page.getByTestId("dynamic-tool-submit")).toBeHidden();
  await expect(page.getByText("请求已处理")).toBeVisible();
});

test("sub-agent activity opens a side panel with the sub-agent timeline", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-parent-thread";
  const subThreadId = "e2e-subagent-thread";
  const secondSubThreadId = "e2e-subagent-thread-2";
  await installRealtimeThreadSnapshotMock(page, {
    snapshots: Object.fromEntries(
      [subThreadId, secondSubThreadId].map((openedThreadId) => {
        const threadName = openedThreadId === secondSubThreadId ? "agent-e2e-second" : "agent-e2e";
        return [
          openedThreadId,
          {
            thread: { id: openedThreadId, name: threadName },
            history: {
              thread: {
                id: openedThreadId,
                turns: [
                  {
                    id: "sub-turn",
                    status: "completed",
                    items: [
                      {
                        id: "sub-agent",
                        type: "agentMessage",
                        phase: "final_answer",
                        text: `Sub-agent finding from ${threadName}.`,
                      },
                    ],
                  },
                ],
              },
            },
            lastEventId: 12,
            recentEvents: [
              {
                id: 12,
                hostId: 1,
                threadId: openedThreadId,
                method: "item/started",
                payload: {
                  params: {
                    threadId: openedThreadId,
                    turnId: "sub-turn",
                    item: {
                      id: "sub-agent",
                      type: "agentMessage",
                      phase: "final_answer",
                      text: `Sub-agent finding from ${threadName}.`,
                    },
                  },
                },
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ];
      }),
    ),
  });
  await page.evaluate(
    ({ threadId, subThreadId }) => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      const store = pinia?._s?.get("gateway");
      if (!store) {
        throw new Error("Unable to locate gateway Pinia store");
      }
      store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
      store.selectedHostId = 1;
      store.selectedThreadId = threadId;
      store.currentThread = { id: threadId, name: "Parent Thread" };
      store.history = {
        thread: {
          id: threadId,
          turns: [
            {
              id: "parent-turn",
              status: "running",
              items: [
                {
                  id: "subagent-activity",
                  type: "subAgentActivity",
                  kind: "started",
                  agentThreadId: subThreadId,
                  agentPath: "agent-e2e",
                },
                {
                  id: "subagent-activity-2",
                  type: "subAgentActivity",
                  kind: "started",
                  agentThreadId: subThreadId + "-2",
                  agentPath: "agent-e2e-second",
                },
              ],
            },
          ],
        },
      };
      store.initializing = false;
      store.loading = false;
    },
    { threadId, subThreadId },
  );

  const mainPane = page.getByTestId("chat-main-pane");
  const widthBeforeOpen = (await mainPane.boundingBox())?.width ?? 0;
  await page.getByTestId("open-subagent-panel").first().click();
  const panel = page.getByTestId("subagent-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("subagent-panel-title")).toHaveText("agent-e2e");
  await expect(panel.getByText("Sub-agent finding from agent-e2e.")).toBeVisible();
  await expect(panel.locator("textarea")).toHaveCount(0);
  await expect
    .poll(async () => (await mainPane.boundingBox())?.width ?? widthBeforeOpen)
    .toBeLessThan(widthBeforeOpen * 0.85);
  await expect(
    page.getByTestId("chat-scroll-area").getByText("agent-e2e", { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    ({ subThreadId }) => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
      const key = `1:${subThreadId}`;
      store.threadPreviews[key] = {
        ...store.threadPreviews[key],
        history: {
          thread: {
            id: subThreadId,
            turns: [
              {
                id: "sub-turn-running",
                status: "inProgress",
                items: [
                  {
                    id: "sub-reasoning",
                    type: "reasoning",
                    status: "inProgress",
                    summary: ["Sub-agent is still running"],
                  },
                ],
              },
            ],
          },
        },
      };
      store.setThreadStatus(1, subThreadId, "running", { turnId: "sub-turn-running" });
      store.realtimeSocketConnected = true;
      (window as any).__subagentInterruptRequest = null;
      const previousSocket = store.realtimeSocket;
      store.realtimeSocket = {
        readyState: WebSocket.OPEN,
        send(raw: string) {
          const message = JSON.parse(raw);
          if (message.type !== "turn.interrupt") {
            previousSocket?.send(raw);
            return;
          }
          (window as any).__subagentInterruptRequest = message;
          window.setTimeout(() => {
            store.handleRealtimeMessage({
              type: "turn.interrupt.accepted",
              requestId: message.requestId,
              hostId: message.hostId,
              threadId: message.threadId,
            });
          }, 0);
        },
      };
    },
    { subThreadId },
  );
  await page.getByRole("button", { name: "停止子代理" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__subagentInterruptRequest))
    .toMatchObject({
      type: "turn.interrupt",
      hostId: 1,
      threadId: subThreadId,
      turnId: "sub-turn-running",
    });

  await page.getByTestId("open-subagent-panel").nth(1).click();
  await expect(panel.getByTestId("subagent-tab")).toHaveCount(2);
  await expect(panel.getByTestId("subagent-panel-title")).toHaveText("agent-e2e-second");
  await expect(panel.getByText("Sub-agent finding from agent-e2e-second.")).toBeVisible();
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    store.selectedThreadId = "e2e-other-parent-thread";
    store.currentThread = { id: "e2e-other-parent-thread", name: "Other Parent Thread" };
    store.history = { thread: { id: "e2e-other-parent-thread", turns: [] } };
  });
  await expect(panel).toBeHidden();
  await expect
    .poll(async () => (await mainPane.boundingBox())?.width ?? 0)
    .toBeGreaterThan(widthBeforeOpen * 0.95);
  await page.evaluate(
    ({ threadId }) => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
      store.selectedThreadId = threadId;
      store.currentThread = { id: threadId, name: "Parent Thread" };
      store.history = {
        thread: {
          id: threadId,
          turns: [
            {
              id: "parent-turn",
              status: "running",
              items: [],
            },
          ],
        },
      };
    },
    { threadId },
  );
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("subagent-tab")).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
        const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
        return {
          preview: Boolean(store.threadPreviews["1:e2e-subagent-thread"]),
          secondPreview: Boolean(store.threadPreviews["1:e2e-subagent-thread-2"]),
          snapshot: Boolean(store.threadSnapshots["1:e2e-subagent-thread"]),
          subscribed: Boolean(store.realtimeThreadSubscriptions["1:e2e-subagent-thread"]),
          secondSubscribed: Boolean(store.realtimeThreadSubscriptions["1:e2e-subagent-thread-2"]),
        };
      }),
    )
    .toEqual({
      preview: true,
      secondPreview: true,
      snapshot: true,
      subscribed: true,
      secondSubscribed: true,
    });
  await page.getByLabel("关闭子代理面板").click();
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("subagent-tab")).toHaveCount(1);
  await page.getByLabel("关闭子代理面板").click();
  await expect(panel).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
        const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
        return {
          preview: Boolean(store.threadPreviews["1:e2e-subagent-thread"]),
          secondPreview: Boolean(store.threadPreviews["1:e2e-subagent-thread-2"]),
          snapshot: Boolean(store.threadSnapshots["1:e2e-subagent-thread"]),
          subscribed: Boolean(store.realtimeThreadSubscriptions["1:e2e-subagent-thread"]),
          secondSubscribed: Boolean(store.realtimeThreadSubscriptions["1:e2e-subagent-thread-2"]),
        };
      }),
    )
    .toEqual({
      preview: false,
      secondPreview: false,
      snapshot: false,
      subscribed: false,
      secondSubscribed: false,
    });
});

test("app-server error notifications are visible in the active thread", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-app-server-error-thread";
    store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.selectedHostId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Error Notification" };
    store.history = { thread: { id: threadId, turns: [] } };
    store.initializing = false;
    store.loading = false;
    store.applyLiveEvent({
      id: 101,
      hostId: 1,
      threadId,
      method: "error",
      payload: {
        params: {
          threadId,
          turnId: "turn-error",
          willRetry: true,
          error: {
            message: "remote provider disconnected",
            codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 502 } },
            additionalDetails: "stream closed before final response",
          },
        },
      },
      createdAt: new Date().toISOString(),
    });
  });

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  await expect(chatScrollArea.getByText("对话：Error Notification")).toBeVisible();
  await expect(chatScrollArea.getByText("remote provider disconnected")).toBeVisible();
  await expect(chatScrollArea.getByText("错误类型：responseStreamDisconnected")).toBeVisible();
  await expect(chatScrollArea.getByText("app-server 正在自动重试")).toBeVisible();

  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-app-server-error-thread";
    store.applyLiveEvent({
      id: 102,
      hostId: 1,
      threadId,
      method: "item/agentMessage/delta",
      payload: {
        params: {
          threadId,
          turnId: "turn-error",
          itemId: "agent-recovered",
          delta: "retry recovered",
        },
      },
      createdAt: new Date().toISOString(),
    });
  });

  await expect(chatScrollArea.getByText("retry recovered")).toBeVisible();
  await expect(chatScrollArea.getByText("remote provider disconnected")).toHaveCount(0);
  await expect(chatScrollArea.getByText("错误类型：responseStreamDisconnected")).toHaveCount(0);
});

test("app-server moderation notifications render a readable summary before raw details", async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-moderation-notification-thread";
    store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.selectedHostId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Moderation Notification" };
    store.history = { thread: { id: threadId, turns: [] } };
    store.initializing = false;
    store.loading = false;
    store.applyLiveEvent({
      id: 201,
      hostId: 1,
      threadId,
      method: "turn/moderationMetadata",
      payload: {
        params: {
          threadId,
          turnId: "turn-moderation",
          metadata: {
            flagged: true,
            model: "omni-moderation-latest",
            categories: { self_harm: true, violence: false },
            raw: "only visible after expanding details",
          },
        },
      },
      createdAt: new Date().toISOString(),
    });
  });

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  await expect(chatScrollArea.getByText("安全审查元数据")).toBeVisible();
  await expect(chatScrollArea.getByText(/flagged=true/)).toBeVisible();
  await expect(chatScrollArea.getByText(/categories=self_harm/)).toBeVisible();
  await expect(chatScrollArea.getByText("only visible after expanding details")).toBeHidden();
  await chatScrollArea.getByRole("button", { name: "查看详情" }).click();
  await expect(chatScrollArea.getByText("only visible after expanding details")).toBeVisible();
});

test("terminal wait notifications mention the command being watched", async ({ page }) => {
  await openApp(page);
  await seedGatewayThread(page, {
    threadId: "e2e-terminal-wait-thread",
    currentThread: { id: "e2e-terminal-wait-thread", name: "Terminal Wait" },
    history: { thread: { id: "e2e-terminal-wait-thread", turns: [] } },
  });
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-terminal-wait-thread";
    store.applyLiveEvent({
      id: 301,
      hostId: 1,
      threadId,
      method: "item/started",
      payload: {
        params: {
          threadId,
          turnId: "turn-terminal",
          item: {
            id: "cmd-watch",
            type: "commandExecution",
            command: "pnpm dev",
            cwd: "/workspace/codex-gateway",
            processId: "proc-123",
            status: "inProgress",
            aggregatedOutput: "",
            exitCode: null,
            durationMs: null,
          },
        },
      },
      createdAt: new Date().toISOString(),
    });
    store.applyLiveEvent({
      id: 302,
      hostId: 1,
      threadId,
      method: "item/commandExecution/terminalInteraction",
      payload: {
        params: {
          threadId,
          turnId: "turn-terminal",
          itemId: "cmd-watch",
          processId: "proc-123",
          stdin: "",
        },
      },
      createdAt: new Date().toISOString(),
    });
  });

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  await expect(chatScrollArea.getByText("agent 正在等待命令：pnpm dev")).toBeVisible();

  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.realtimeSocketConnected = true;
    (window as any).__interruptRequest = null;
    store.realtimeSocket = {
      readyState: WebSocket.OPEN,
      send(raw: string) {
        const message = JSON.parse(raw);
        (window as any).__interruptRequest = message;
        window.setTimeout(() => {
          store.handleRealtimeMessage({
            type: "turn.interrupt.accepted",
            requestId: message.requestId,
            hostId: message.hostId,
            threadId: message.threadId,
          });
        }, 0);
      },
    };
  });

  await page.evaluate(async () => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    await store.interruptActiveTurn();
  });

  await expect
    .poll(() => page.evaluate(() => (window as any).__interruptRequest))
    .toMatchObject({
      type: "turn.interrupt",
      hostId: 1,
      threadId: "e2e-terminal-wait-thread",
      turnId: "turn-terminal",
    });
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
  await page.evaluate((threadId) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.applyLiveEvent({
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
    store.applyLiveEvent({
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
  }, threadId);

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  await expect(chatScrollArea.getByText("压缩上下文")).toBeVisible();
  await expect(chatScrollArea.getByText("4.25s")).toBeVisible();
  await expect(chatScrollArea.getByText("0.00s")).toBeHidden();
});

test("restoring a cached thread keeps active context compaction running without refetching", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-active-context-cache-thread";
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Active Context Cache" },
    history: {
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
    },
    status: "completed",
  });
  await installRealtimeThreadSnapshotMock(page, { snapshots: {} });
  await page.evaluate(async (threadId) => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.cacheSelectedThreadSnapshot();
    store.selectedThreadId = "e2e-other-thread";
    store.currentThread = { id: "e2e-other-thread", name: "Other Thread" };
    store.history = { thread: { id: "e2e-other-thread", turns: [] } };
    await store.openThread(threadId, { hostId: 1, projectId: null });
  }, threadId);

  await expect(page.getByTestId("send-turn-button")).toHaveAttribute("aria-label", "停止生成");
  await expect(page.getByText("压缩上下文")).toBeVisible();
});

async function parkChatViewportInMiddle(page: Page) {
  await expect
    .poll(() =>
      page.getByTestId("chat-scroll-area").evaluate((root: HTMLElement) => {
        const viewport = root.querySelector(
          '[data-slot="scroll-area-viewport"]',
        ) as HTMLElement | null;
        if (!viewport) return 0;
        return viewport.scrollHeight - viewport.clientHeight;
      }),
    )
    .toBeGreaterThan(400);
  return await page.getByTestId("chat-scroll-area").evaluate((root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    viewport.scrollTop = Math.floor((viewport.scrollHeight - viewport.clientHeight) / 2);
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    return viewport.scrollTop;
  });
}

async function chatViewportScrollTop(page: Page) {
  return await page.getByTestId("chat-scroll-area").evaluate((root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    return viewport.scrollTop;
  });
}

async function scrollChatViewportToBottom(page: Page) {
  await page.getByTestId("chat-scroll-area").evaluate((root: HTMLElement) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    viewport.scrollTop = viewport.scrollHeight;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

async function parkCommandOutputInMiddle(page: Page) {
  await expect.poll(() => commandOutputMaxScrollTop(page)).toBeGreaterThan(120);
  return await page
    .getByText("command output line 001")
    .first()
    .evaluate((element: HTMLElement) => {
      const viewport = element.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
      if (!viewport) throw new Error("Missing command output viewport");
      viewport.scrollTop = Math.floor((viewport.scrollHeight - viewport.clientHeight) / 2);
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      return viewport.scrollTop;
    });
}

async function commandOutputScrollTop(page: Page) {
  return await page
    .getByText("command output line 001")
    .first()
    .evaluate((element: HTMLElement) => {
      const viewport = element.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
      if (!viewport) throw new Error("Missing command output viewport");
      return viewport.scrollTop;
    });
}

async function commandOutputMaxScrollTop(page: Page) {
  return await page
    .getByText("command output line 001")
    .first()
    .evaluate((element: HTMLElement) => {
      const viewport = element.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
      if (!viewport) throw new Error("Missing command output viewport");
      return viewport.scrollHeight - viewport.clientHeight;
    });
}
