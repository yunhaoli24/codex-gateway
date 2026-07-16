import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";
import {
  installRealtimeInterruptMock,
  installRealtimeThreadSnapshotMock,
  seedGatewayThread,
  setThreadViewHistoryAndStatus,
  subAgentRuntimeFlags,
} from "./helpers/gateway-store";

test("sub-agent activity opens workspace tabs with sub-agent timelines", async ({ page }) => {
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
            // Forked app-server history includes parent turns before Thread.createdAt.
            // The panel must keep the subagent metadata title instead of inheriting this name.
            thread: { id: openedThreadId, name: "Inherited Parent Thread", createdAt: 200 },
            history: {
              thread: {
                id: openedThreadId,
                turns: [
                  {
                    id: "inherited-parent-turn",
                    status: "completed",
                    startedAt: 100,
                    items: [
                      {
                        id: "inherited-parent-message",
                        type: "agentMessage",
                        phase: "final_answer",
                        text: "Inherited parent content must not render in the subagent panel.",
                      },
                    ],
                  },
                  {
                    id: "sub-turn",
                    status: "completed",
                    startedAt: 210,
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
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Parent Thread" },
    status: "running",
    history: {
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
                agentThreadId: secondSubThreadId,
                agentPath: "agent-e2e-second",
              },
              {
                id: "subagent-send-input",
                type: "collabAgentToolCall",
                tool: "sendInput",
                status: "completed",
                senderThreadId: threadId,
                receiverThreadIds: [subThreadId],
                prompt: "Inspect the focused-store migration boundary.",
                model: null,
                reasoningEffort: null,
                agentsStates: {
                  [subThreadId]: { status: "running", message: null },
                },
              },
            ],
          },
        ],
      },
    },
  });

  const mainPane = page.getByTestId("chat-main-pane");
  const activeAgents = page.getByTestId("active-subagents");
  await expect(activeAgents).toContainText("agent-e2e");
  await expect(activeAgents).toContainText("agent-e2e-second");
  await expect(page.getByText("Inspect the focused-store migration boundary.")).toBeVisible();
  await activeAgents.getByTestId("open-active-subagent").first().click();
  const panel = page.locator('[data-testid="workspace-subagent-panel"]:visible');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("workspace-panel-title")).toHaveText("agent-e2e");
  await expect(panel.getByText("Sub-agent finding from agent-e2e.")).toBeVisible();
  await expect(
    panel.getByText("Inherited parent content must not render in the subagent panel."),
  ).toHaveCount(0);
  await expect(panel.locator("textarea")).toHaveCount(0);
  await expect(mainPane).toBeHidden();
  await agentWorkspaceTab(page).click();
  await expect(mainPane).toBeVisible();
  await expect(
    page.getByTestId("chat-scroll-area").getByText("agent-e2e", { exact: true }),
  ).toBeVisible();
  await setThreadViewHistoryAndStatus(page, {
    hostId: 1,
    threadId: subThreadId,
    status: "running",
    turnId: "sub-turn-running",
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
  });
  await installRealtimeInterruptMock(page, {
    windowKey: "__subagentInterruptRequest",
    passThroughNonInterrupt: true,
  });
  await subAgentTab(page, "agent-e2e").click();
  await expect(panel.getByText("Sub-agent is still running")).toBeVisible();
  await page.getByRole("button", { name: "停止子代理" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__subagentInterruptRequest))
    .toMatchObject({
      type: "turn.interrupt",
      hostId: 1,
      threadId: subThreadId,
      turnId: "sub-turn-running",
    });

  await agentWorkspaceTab(page).click();
  await page.getByTestId("open-subagent-panel").nth(1).click();
  await expect(subAgentTab(page, "agent-e2e")).toHaveCount(1);
  await expect(subAgentTab(page, "agent-e2e-second")).toHaveCount(1);
  await expect(panel.getByTestId("workspace-panel-title")).toHaveText("agent-e2e-second");
  await expect(panel.getByText("Sub-agent finding from agent-e2e-second.")).toBeVisible();
  await seedGatewayThread(page, {
    threadId: "e2e-other-parent-thread",
    currentThread: { id: "e2e-other-parent-thread", name: "Other Parent Thread" },
    history: { thread: { id: "e2e-other-parent-thread", turns: [] } },
  });
  await expect(panel).toBeHidden();
  await expect(mainPane).toBeVisible();
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Parent Thread" },
    status: "running",
    history: {
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
    },
  });
  await expect(panel).toBeVisible();
  await expect(subAgentTab(page, "agent-e2e")).toHaveCount(1);
  await expect(subAgentTab(page, "agent-e2e-second")).toHaveCount(1);
  await expect
    .poll(() =>
      subAgentRuntimeFlags(page, {
        hostId: 1,
        firstThreadId: subThreadId,
        secondThreadId: secondSubThreadId,
      }),
    )
    .toEqual({
      view: true,
      secondView: true,
      subscribed: true,
      secondSubscribed: true,
    });
  await closeWorkspaceTab(page);
  await expect(panel).toBeVisible();
  await expect(subAgentTab(page, "agent-e2e-second")).toHaveCount(0);
  await closeWorkspaceTab(page);
  await expect(panel).toBeHidden();
  await expect(mainPane).toBeVisible();
  await expect
    .poll(() =>
      subAgentRuntimeFlags(page, {
        hostId: 1,
        firstThreadId: subThreadId,
        secondThreadId: secondSubThreadId,
      }),
    )
    .toEqual({
      view: false,
      secondView: false,
      subscribed: false,
      secondSubscribed: false,
    });
});

function subAgentTab(page: Page, title: string) {
  return page.locator(
    `[data-testid="workspace-dock-tab"][data-panel-kind="subagent"][data-panel-title="${title}"]`,
  );
}

function agentWorkspaceTab(page: Page) {
  return page.locator('[data-testid="workspace-dock-tab"][data-panel-kind="agent"]');
}

async function closeWorkspaceTab(page: Page) {
  await page.getByRole("button", { name: "关闭标签页" }).last().click();
}
