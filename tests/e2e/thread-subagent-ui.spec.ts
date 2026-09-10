import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";
import { gatewayEventFromNotification } from "./helpers/canonical-event";
import {
  capturedRealtimeInterrupt,
  installRealtimeInterruptMock,
  installRealtimeThreadSnapshotMock,
  seedGatewayThread,
  setThreadViewHistoryAndStatus,
  subAgentRuntimeFlags,
} from "./helpers/gateway-store";

test("sub-agent activity opens workspace tabs with sub-agent timelines", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-parent-thread";
  const subThreadId = "019fa64e-1000-7000-8000-000000000001";
  const secondSubThreadId = "019fa64e-1000-7000-8000-000000000002";
  await page.route("**/api/threads/metadata?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: subThreadId,
            parentThreadId: threadId,
            agentNickname: "Atlas",
            agentRole: "explorer",
          },
          {
            id: secondSubThreadId,
            parentThreadId: threadId,
            agentNickname: "Nova",
            agentRole: "reviewer",
          },
        ],
      }),
    });
  });
  await installRealtimeThreadSnapshotMock(page, {
    snapshots: Object.fromEntries(
      [subThreadId, secondSubThreadId].map((openedThreadId) => {
        const threadName = openedThreadId === secondSubThreadId ? "Nova" : "Atlas";
        const agentRole = openedThreadId === secondSubThreadId ? "reviewer" : "explorer";
        return [
          openedThreadId,
          {
            // Forked app-server history includes parent turns before Thread.createdAt.
            // The panel must keep the subagent metadata title instead of inheriting this name.
            thread: {
              id: openedThreadId,
              name: "Inherited Parent Thread",
              agentNickname: threadName,
              agentRole,
              createdAt: 200,
            },
            history: {
              thread: {
                id: openedThreadId,
                turns: [
                  {
                    id:
                      openedThreadId === secondSubThreadId
                        ? "parent-turn"
                        : "inherited-parent-turn",
                    status: "completed",
                    startedAt: openedThreadId === secondSubThreadId ? null : 100,
                    items: [
                      {
                        id:
                          openedThreadId === secondSubThreadId
                            ? "subagent-activity"
                            : "inherited-parent-message",
                        type: "agentMessage",
                        phase: "final_answer",
                        text: "Inherited parent content must not render in the subagent panel.",
                      },
                    ],
                  },
                  {
                    id: "sub-turn",
                    status: "completed",
                    startedAt: openedThreadId === secondSubThreadId ? null : 210,
                    items: [
                      {
                        id: "sub-agent",
                        type: "agentMessage",
                        phase: "final_answer",
                        text: `Sub-agent finding from ${threadName}.`,
                      },
                    ],
                  },
                  ...(openedThreadId === secondSubThreadId
                    ? [
                        {
                          id: "sub-turn-2",
                          status: "completed",
                          startedAt: null,
                          items: [
                            {
                              id: "sub-agent-2",
                              type: "agentMessage",
                              phase: "final_answer",
                              text: "Second untimestamped finding from Nova.",
                            },
                          ],
                        },
                      ]
                    : []),
                ],
              },
            },
            lastEventId: 12,
            recentEvents: [
              gatewayEventFromNotification({
                id: 12,
                threadId: openedThreadId,
                method: "item/started",
                params: {
                  threadId: openedThreadId,
                  turnId: "sub-turn",
                  startedAtMs: Date.now(),
                  item: {
                    id: "sub-agent",
                    type: "agentMessage",
                    phase: "final_answer",
                    text: `Sub-agent finding from ${threadName}.`,
                  },
                },
              }),
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
                agentPath: subThreadId,
              },
              {
                id: "subagent-activity-2",
                type: "subAgentActivity",
                kind: "started",
                agentThreadId: secondSubThreadId,
                agentPath: secondSubThreadId,
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
                  [subThreadId]: { status: "inProgress", message: null },
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
  await expect(activeAgents.getByTestId("open-active-subagent")).toHaveCount(2);
  await expect(activeAgents).toContainText("Atlas [explorer]");
  await expect(activeAgents).toContainText("Nova [reviewer]");
  await expect(activeAgents).not.toContainText(subThreadId);
  await expect(activeAgents).not.toContainText(secondSubThreadId);
  await expect(page.getByText("Inspect the focused-store migration boundary.")).toBeVisible();
  await activeAgents.getByTestId("open-active-subagent").first().click();
  const panel = page.locator('[data-testid="workspace-subagent-panel"]:visible');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("workspace-panel-title")).toHaveText("Atlas [explorer]");
  await expect(panel.getByTestId("subagent-thread-id")).toHaveText(subThreadId);
  await expect(panel.getByText("Sub-agent finding from Atlas.")).toBeVisible();
  await expect(
    panel.getByText("Inherited parent content must not render in the subagent panel."),
  ).toHaveCount(0);
  await expect(panel.locator("textarea")).toHaveCount(0);
  await expect(mainPane).toBeHidden();
  await agentWorkspaceTab(page).click();
  await expect(mainPane).toBeVisible();
  await expect(
    page
      .getByTestId("chat-scroll-area")
      .getByTestId("open-collab-subagent-panel")
      .filter({ hasText: "Atlas [explorer]" }),
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
    passThroughNonInterrupt: true,
  });
  await subAgentTab(page, "Atlas [explorer]").click();
  await expect(panel.getByText("Sub-agent is still running")).toBeVisible();
  await page.getByRole("button", { name: "停止子代理" }).click();
  await expect
    .poll(() => capturedRealtimeInterrupt(page))
    .toMatchObject({
      type: "turn.interrupt",
      hostId: 1,
      threadId: subThreadId,
      turnId: "sub-turn-running",
    });

  await agentWorkspaceTab(page).click();
  await page.getByTestId("open-subagent-panel").nth(1).click();
  await expect(subAgentTab(page, "Atlas [explorer]")).toHaveCount(1);
  await expect(subAgentTab(page, "Nova [reviewer]")).toHaveCount(1);
  await expect(panel.getByTestId("workspace-panel-title")).toHaveText("Nova [reviewer]");
  await expect(panel.getByText("Sub-agent finding from Nova.")).toBeVisible();
  await expect(panel.getByText("Second untimestamped finding from Nova.")).toBeVisible();
  await expect(
    panel.getByText("Inherited parent content must not render in the subagent panel."),
  ).toHaveCount(0);
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
  await expect(subAgentTab(page, "Atlas [explorer]")).toHaveCount(1);
  await expect(subAgentTab(page, "Nova [reviewer]")).toHaveCount(1);
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
  await expect(subAgentTab(page, "Nova [reviewer]")).toHaveCount(0);
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
