import { expect, test } from "@playwright/test";
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
