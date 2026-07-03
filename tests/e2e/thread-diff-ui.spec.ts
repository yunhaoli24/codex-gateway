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

test("goal slash input derives the goal tag and requires an objective before submitting", async ({
  page,
}) => {
  await openApp(page);
  await seedGatewayThread(page, {
    threadId: "e2e-goal-slash-thread",
    currentThread: { id: "e2e-goal-slash-thread", name: "Goal Slash" },
    history: { thread: { id: "e2e-goal-slash-thread", turns: [] } },
  });
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.setSelectedThreadGoal = async (objective: string) => {
      (window as any).__submittedGoalObjective = objective;
      store.upsertThreadGoal(1, "e2e-goal-slash-thread", {
        threadId: "e2e-goal-slash-thread",
        objective,
        status: "active",
        tokenBudget: null,
        tokensUsed: 0,
        timeUsedSeconds: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    };
  });

  const composer = page.getByPlaceholder("输入后续修改要求");
  await composer.fill("/goal");
  await expect(
    page.getByTestId("composer-mode-ticker").getByText("目标", { exact: true }).first(),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(composer).toHaveValue("/goal ");
  await page.keyboard.press("Enter");
  await expect(composer).toHaveValue("/goal ");
  await expect(page.getByTestId("chat-scroll-area").getByText("请输入目标内容")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__submittedGoalObjective ?? null))
    .toBeNull();

  await composer.fill("/goal 完成当前重构");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => (window as any).__submittedGoalObjective))
    .toBe("完成当前重构");
  await expect(composer).toHaveValue("");
  await expect(
    page.getByTestId("composer-mode-ticker").getByText("完成当前重构").first(),
  ).toBeVisible();
});

test("goal progress updates the composer ticker without flooding the agent loop", async ({
  page,
}) => {
  await openApp(page);
  await seedGatewayThread(page, {
    threadId: "e2e-goal-progress-thread",
    currentThread: { id: "e2e-goal-progress-thread", name: "Goal Progress" },
    history: {
      thread: {
        id: "e2e-goal-progress-thread",
        turns: [
          {
            id: "turn-goal-progress",
            status: "running",
            items: [
              {
                id: "user-goal-progress",
                type: "userMessage",
                content: [{ type: "text", text: "work on the goal" }],
              },
            ],
          },
        ],
      },
    },
    status: "running",
  });

  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-goal-progress-thread";
    store.applyLiveEvent({
      id: 301,
      hostId: 1,
      threadId,
      method: "thread/goal/updated",
      payload: {
        params: {
          threadId,
          turnId: "turn-goal-progress",
          goal: {
            threadId,
            objective: "持续重构输入框状态",
            status: "active",
            tokenBudget: null,
            tokensUsed: 128,
            timeUsedSeconds: 3,
            createdAt: Date.now() - 3000,
            updatedAt: Date.now(),
          },
        },
      },
      createdAt: new Date().toISOString(),
    });
    store.applyLiveEvent({
      id: 302,
      hostId: 1,
      threadId,
      method: "thread/goal/updated",
      payload: {
        params: {
          threadId,
          turnId: "turn-goal-progress",
          goal: {
            threadId,
            objective: "持续重构输入框状态",
            status: "active",
            tokenBudget: null,
            tokensUsed: 256,
            timeUsedSeconds: 4,
            createdAt: Date.now() - 4000,
            updatedAt: Date.now(),
          },
        },
      },
      createdAt: new Date().toISOString(),
    });
  });

  const ticker = page.getByTestId("composer-mode-ticker");
  await expect(ticker.getByText("持续重构输入框状态").first()).toBeVisible();
  await expect(ticker.getByText(/256 tokens/).first()).toBeVisible();
  await expect(page.getByTestId("chat-scroll-area").getByText("目标已更新")).toHaveCount(0);

  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-goal-progress-thread";
    store.applyLiveEvent({
      id: 303,
      hostId: 1,
      threadId,
      method: "thread/goal/updated",
      payload: {
        params: {
          threadId,
          turnId: "turn-goal-progress",
          goal: {
            threadId,
            objective: "持续重构输入框状态",
            status: "complete",
            tokenBudget: null,
            tokensUsed: 512,
            timeUsedSeconds: 8,
            createdAt: Date.now() - 8000,
            updatedAt: Date.now(),
          },
        },
      },
      createdAt: new Date().toISOString(),
    });
  });

  await expect(page.getByTestId("composer-mode-ticker")).toHaveCount(0);
  await expect(page.getByTestId("chat-scroll-area").getByText("目标已更新")).toHaveCount(0);
});

test("plan mode shows implementation actions for a second completed turn plan", async ({
  page,
}) => {
  await openApp(page);
  await seedGatewayThread(page, {
    threadId: "e2e-repeat-plan-thread",
    currentThread: { id: "e2e-repeat-plan-thread", name: "Repeat Plan" },
    history: {
      thread: {
        id: "e2e-repeat-plan-thread",
        turns: [
          {
            id: "turn-plan-1",
            status: "completed",
            items: [
              {
                id: "user-plan-1",
                type: "userMessage",
                content: [{ type: "text", text: "make a plan" }],
              },
              {
                id: "plan-1",
                type: "plan",
                status: "completed",
                text: "first plan",
              },
            ],
          },
          {
            id: "turn-plan-2",
            status: "completed",
            items: [
              {
                id: "user-plan-2",
                type: "userMessage",
                clientId: "steer-repeat-plan",
                content: [{ type: "text", text: "continue planning" }],
              },
              {
                id: "reasoning-before-plan-2",
                type: "reasoning",
                status: "completed",
                summary: ["checked constraints before second plan"],
              },
              {
                id: "turn-plan-2-plan",
                type: "turnPlan",
                turnId: "turn-plan-2",
                explanation: "second plan",
                plan: [{ step: "apply the second plan", status: "pending" }],
              },
            ],
          },
        ],
      },
    },
    status: "completed",
  });
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const store = app?.config?.globalProperties?.$pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    store.setThreadCollaborationMode(1, "e2e-repeat-plan-thread", "plan");
    store.dismissPlanImplementationPrompt(1, "e2e-repeat-plan-thread", "plan-1");
  });

  await expect(page.getByText("first plan")).toBeVisible();
  await expect(
    page.getByTestId("chat-scroll-area").getByText("second plan", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("composer-mode-ticker").getByText("计划模式", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("composer-mode-ticker").getByText("second plan", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("checked constraints before second plan")).toBeHidden();
  await expect(page.getByRole("button", { name: "执行计划" })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续计划" })).toBeVisible();
  await page.getByRole("button", { name: "退出计划模式" }).click();
  await expect(page.getByText("计划模式")).toBeHidden();
});

test("switching to cached thread history renders without waiting for the next event", async ({
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
    const firstThreadId = "e2e-visible-first-thread";
    const secondThreadId = "e2e-visible-second-thread";
    store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.projects = [{ id: 1, hostId: 1, name: "E2E Project", remotePath: "/tmp/e2e" }];
    store.selectedHostId = 1;
    store.selectedProjectId = 1;
    store.selectedThreadId = firstThreadId;
    store.currentThread = { id: firstThreadId, name: "First Visible Thread" };
    store.history = {
      thread: {
        id: firstThreadId,
        turns: [
          {
            id: "turn-visible-first",
            status: "completed",
            items: [
              {
                id: "agent-visible-first",
                type: "agentMessage",
                status: "completed",
                text: "first cached thread content",
              },
            ],
          },
        ],
      },
    };
    store.initializing = false;
    store.loading = false;

    store.selectedThreadId = secondThreadId;
    store.currentThread = { id: secondThreadId, name: "Second Visible Thread" };
    store.history = {
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
    };
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
    store.threadViews["1:e2e-terminal-cursor-thread"] = {
      hostId: 1,
      projectId: 1,
      threadId,
      currentThread: store.currentThread,
      history: store.history,
      events: [],
      olderTurnsCursor: null,
      newerTurnsCursor: null,
      lastEventId: 11,
      loading: false,
      error: null,
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
    };
    store.initializing = false;
    store.loading = false;
  });

  await expect(page.getByText("agent loop line 140")).toBeVisible();
  const nearBottomScrollTop = await detachChatViewportNearBottom(page);
  await expect(page.getByTestId("chat-scroll-area")).toHaveAttribute("data-follow-latest", "false");
  await appendAgentStreamLines(page, "agent-scroll-1", "near-bottom stream line", 30);
  await page.waitForTimeout(300);
  await expect
    .poll(() => chatViewportScrollTop(page))
    .toBeGreaterThanOrEqual(nearBottomScrollTop - 2);
  await expect.poll(() => chatViewportScrollTop(page)).toBeLessThanOrEqual(nearBottomScrollTop + 2);

  const mainScrollTop = await parkChatViewportInMiddle(page);
  await expect(page.getByTestId("chat-scroll-area")).toHaveAttribute("data-follow-latest", "false");
  const visibleAnchor = await captureVisibleAgentLineAnchor(page);

  await appendAgentStreamLines(page, "agent-scroll-1", "new agent stream line", 40);

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
  await appendFileDiffLines(page, "file-scroll-1", "src/stream.py", "new diff stream line", 60);

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

test("completed turns do not collapse intermediate steps while the user is detached", async ({
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
    const threadId = "e2e-detached-collapse-thread";
    const agentLines = Array.from(
      { length: 150 },
      (_, index) => `collapse anchor line ${String(index + 1).padStart(3, "0")}`,
    );

    store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.projects = [{ id: 1, hostId: 1, name: "E2E Project", remotePath: "/tmp/e2e" }];
    store.selectedHostId = 1;
    store.selectedProjectId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Detached Collapse" };
    store.history = {
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
    };
    store.initializing = false;
    store.loading = false;
  });

  await expect(page.getByText("collapse anchor line 150")).toBeVisible();
  await parkChatViewportInMiddle(page);
  const visibleAnchor = await captureVisibleTextAnchor(page, "collapse anchor line ");

  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const turn = store.history.thread.turns[0];
    turn.status = "completed";
    const agent = turn.items.find((item: any) => item.id === "agent-collapse-1");
    agent.status = "completed";
    turn.items.push({
      id: "agent-collapse-final",
      type: "agentMessage",
      phase: "final_answer",
      status: "completed",
      text: "final answer after intermediate work",
    });
    store.history = { thread: { ...store.history.thread, turns: [...store.history.thread.turns] } };
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
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }
    const threadId = "e2e-manual-intermediate-open-thread";
    const intermediateLines = Array.from(
      { length: 140 },
      (_, index) => `manual intermediate line ${String(index + 1).padStart(3, "0")}`,
    );

    store.hosts = [{ id: 1, name: "E2E Host", sshHost: "localhost", sshUser: "codex" }];
    store.projects = [{ id: 1, hostId: 1, name: "E2E Project", remotePath: "/tmp/e2e" }];
    store.selectedHostId = 1;
    store.selectedProjectId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Manual Intermediate Open" };
    store.history = {
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
    };
    store.threadStatuses = { "1:e2e-manual-intermediate-open-thread": "completed" };
    store.initializing = false;
    store.loading = false;
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
    store.cacheSelectedThreadView();
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
    viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -240 }));
    viewport.scrollTop = Math.floor((viewport.scrollHeight - viewport.clientHeight) / 2);
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    return viewport.scrollTop;
  });
}

async function detachChatViewportNearBottom(page: Page) {
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
    viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight - 48);
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -24 }));
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

async function captureVisibleAgentLineAnchor(page: Page) {
  return await captureVisibleTextAnchor(page, "agent loop line ");
}

async function captureVisibleTextAnchor(page: Page, prefix: string) {
  return await page.getByTestId("chat-scroll-area").evaluate((root: HTMLElement, prefix) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    const viewportRect = viewport.getBoundingClientRect();
    const paragraphs = Array.from(viewport.querySelectorAll("p"));
    const element = paragraphs.find((candidate) => {
      const text = candidate.textContent?.trim() ?? "";
      const rect = candidate.getBoundingClientRect();
      return (
        text.startsWith(prefix) &&
        rect.top >= viewportRect.top + 8 &&
        rect.bottom <= viewportRect.bottom - 8
      );
    });
    if (!element) {
      throw new Error(`Missing visible text anchor ${prefix}`);
    }
    return {
      text: element.textContent?.trim() ?? "",
      top: element.getBoundingClientRect().top,
    };
  }, prefix);
}

async function visibleAgentLineTop(page: Page, text: string) {
  return await visibleTextTop(page, text);
}

async function visibleTextTop(page: Page, text: string) {
  return await page.getByTestId("chat-scroll-area").evaluate((root: HTMLElement, text) => {
    const viewport = root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
    if (!viewport) throw new Error("Missing chat viewport");
    const element = Array.from(viewport.querySelectorAll("p")).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    if (!element) {
      throw new Error(`Missing visible agent line ${text}`);
    }
    return element.getBoundingClientRect().top;
  }, text);
}

async function appendAgentStreamLines(page: Page, itemId: string, prefix: string, count: number) {
  await page.evaluate(
    ({ count, itemId, prefix }) => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      const store = pinia?._s?.get("gateway");
      if (!store) {
        throw new Error("Unable to locate gateway Pinia store");
      }
      const turn = store.history.thread.turns[0];
      const agent = turn.items.find((item: any) => item.id === itemId);
      agent.text +=
        "\n\n" +
        Array.from(
          { length: count },
          (_, index) => `${prefix} ${String(index + 1).padStart(3, "0")}`,
        ).join("\n\n");
      store.history = {
        thread: { ...store.history.thread, turns: [...store.history.thread.turns] },
      };
    },
    { count, itemId, prefix },
  );
}

async function appendFileDiffLines(
  page: Page,
  itemId: string,
  path: string,
  prefix: string,
  count: number,
) {
  await page.evaluate(
    ({ count, itemId, path, prefix }) => {
      const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      const store = pinia?._s?.get("gateway");
      if (!store) {
        throw new Error("Unable to locate gateway Pinia store");
      }
      const turn = store.history.thread.turns[0];
      const fileChange = turn.items.find((item: any) => item.id === itemId);
      const change = fileChange.changes.find((candidate: any) => candidate.path === path);
      change.diff +=
        "\n" +
        Array.from(
          { length: count },
          (_, index) => `+${prefix} ${String(index + 1).padStart(3, "0")}`,
        ).join("\n");
      store.history = {
        thread: { ...store.history.thread, turns: [...store.history.thread.turns] },
      };
    },
    { count, itemId, path, prefix },
  );
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
      viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -120 }));
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
