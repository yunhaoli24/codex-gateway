import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import { installRealtimeThreadSnapshotMock } from "./helpers/gateway-store";

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
      store.threadViews[key] = {
        ...store.threadViews[key],
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
          view: Boolean(store.threadViews["1:e2e-subagent-thread"]),
          secondView: Boolean(store.threadViews["1:e2e-subagent-thread-2"]),
          subscribed: Boolean(store.realtimeThreadSubscriptions["1:e2e-subagent-thread"]),
          secondSubscribed: Boolean(store.realtimeThreadSubscriptions["1:e2e-subagent-thread-2"]),
        };
      }),
    )
    .toEqual({
      view: true,
      secondView: true,
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
          view: Boolean(store.threadViews["1:e2e-subagent-thread"]),
          secondView: Boolean(store.threadViews["1:e2e-subagent-thread-2"]),
          subscribed: Boolean(store.realtimeThreadSubscriptions["1:e2e-subagent-thread"]),
          secondSubscribed: Boolean(store.realtimeThreadSubscriptions["1:e2e-subagent-thread-2"]),
        };
      }),
    )
    .toEqual({
      view: false,
      secondView: false,
      subscribed: false,
      secondSubscribed: false,
    });
});
