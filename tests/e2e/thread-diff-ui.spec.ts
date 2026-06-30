import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";

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

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "closed");
  await expect(diffText).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "open");
  await expect(diffText).toBeVisible();
});

test("opening completed history does not replay terminal notifications or show fake thinking", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const notifications: Array<{ title: string; body?: string }> = [];
    class TestNotification {
      static permission = "granted";
      static async requestPermission() {
        return "granted";
      }

      constructor(title: string, options?: NotificationOptions) {
        notifications.push({ title, body: options?.body });
      }
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: TestNotification,
    });
    (window as any).__gatewayNotifications = notifications;
  });
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
      store.applyLiveEvent(event, { notifyTerminal: false });
    }
    store.setThreadStatus(1, threadId, "completed", { notifyTerminal: false });
  });

  await expect(page.getByText("completed history")).toBeVisible();
  await expect(page.getByText("思考中")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => (window as any).__gatewayNotifications.length))
    .toBe(0);
});

test("repeated terminal events for the same turn only notify once", async ({ page }) => {
  await page.addInitScript(() => {
    const notifications: Array<{ title: string; body?: string }> = [];
    class TestNotification {
      static permission = "granted";
      static async requestPermission() {
        return "granted";
      }

      constructor(title: string, options?: NotificationOptions) {
        notifications.push({ title, body: options?.body });
      }
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: TestNotification,
    });
    (window as any).__gatewayNotifications = notifications;
  });
  await openApp(page);
  await page.evaluate(() => {
    const app = (document.querySelector("#__nuxt") as any)?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    const store = pinia?._s?.get("gateway");
    if (!store) {
      throw new Error("Unable to locate gateway Pinia store");
    }

    const threadId = "e2e-terminal-dedupe-thread";
    const turn = { id: "turn-dedupe-1", status: "completed", items: [] };
    const startedEvent = {
      id: 10,
      hostId: 1,
      threadId,
      method: "turn/started",
      payload: { params: { threadId, turn: { id: turn.id, status: "inProgress", items: [] } } },
    };
    const completedEvent = {
      id: 11,
      hostId: 1,
      threadId,
      method: "turn/completed",
      payload: { params: { threadId, turn } },
    };

    store.hosts = [{ id: 1, name: "NC-VPS", sshHost: "localhost", sshUser: "codex" }];
    store.selectedHostId = 1;
    store.selectedThreadId = threadId;
    store.currentThread = { id: threadId, name: "Terminal Dedupe" };
    store.history = { thread: { id: threadId, turns: [] } };
    store.initializing = false;
    store.loading = false;

    store.applyLiveEvent(startedEvent, { notifyTerminal: true });
    store.applyLiveEvent(completedEvent, { notifyTerminal: true });
    store.applyLiveEvent(startedEvent, { notifyTerminal: true });
    store.applyLiveEvent(completedEvent, { notifyTerminal: true });
  });

  await expect
    .poll(() => page.evaluate(() => (window as any).__gatewayNotifications.length))
    .toBe(1);
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
