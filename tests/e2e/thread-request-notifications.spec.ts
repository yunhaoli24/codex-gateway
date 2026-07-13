import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import {
  applyGatewayLiveEvent,
  interruptActiveTurnInStore,
  installRealtimeInterruptMock,
  installServerRequestResponderMock,
  seedGatewayThread,
} from "./helpers/gateway-store";

test("dynamic tool response submits through the server request responder and surfaces failures", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-dynamic-tool-thread";
  await seedGatewayThread(page, {
    hostId: 7,
    projectId: 3,
    threadId,
    currentThread: { id: threadId, name: "Dynamic Tool" },
    status: "running",
    history: {
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
    },
  });

  await installServerRequestResponderMock(page, {
    mode: "capture",
    windowKey: "__submittedServerRequest",
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

  await installServerRequestResponderMock(page, {
    mode: "fail",
    message: "pending app-server request was not found",
  });

  await page.getByTestId("dynamic-tool-submit").click();
  await expect(page.getByText("pending app-server request was not found")).toBeVisible();
  await expect(
    page.getByTestId("chat-scroll-area").getByText("pending app-server request was not found"),
  ).toHaveCount(0);

  await applyGatewayLiveEvent(page, {
    id: 43,
    hostId: 7,
    threadId,
    method: "serverRequest/resolved",
    payload: { params: { threadId, requestId: 42 } },
    createdAt: new Date().toISOString(),
  });
  await expect(page.getByTestId("dynamic-tool-submit")).toBeHidden();
  await expect(page.getByText("请求已处理")).toBeVisible();
});

test("app-server error notifications use Sonner without entering the timeline", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-app-server-error-thread";
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Error Notification" },
    history: { thread: { id: threadId, turns: [] } },
  });
  await applyGatewayLiveEvent(page, {
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

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  await expect(page.getByText(/remote provider disconnected/)).toBeVisible();
  await expect(page.getByText(/错误类型：responseStreamDisconnected/)).toBeVisible();
  await expect(page.getByText(/app-server 正在自动重试/)).toBeVisible();
  await expect(chatScrollArea.getByText("remote provider disconnected")).toHaveCount(0);

  await applyGatewayLiveEvent(page, {
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

  await expect(chatScrollArea.getByText("retry recovered")).toBeVisible();
});

test("app-server moderation notifications render a readable summary before raw details", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-moderation-notification-thread";
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Moderation Notification" },
    history: { thread: { id: threadId, turns: [] } },
  });
  await applyGatewayLiveEvent(page, {
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
  await applyGatewayLiveEvent(page, {
    id: 301,
    hostId: 1,
    threadId: "e2e-terminal-wait-thread",
    method: "item/started",
    payload: {
      params: {
        threadId: "e2e-terminal-wait-thread",
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
  await applyGatewayLiveEvent(page, {
    id: 302,
    hostId: 1,
    threadId: "e2e-terminal-wait-thread",
    method: "item/commandExecution/terminalInteraction",
    payload: {
      params: {
        threadId: "e2e-terminal-wait-thread",
        turnId: "turn-terminal",
        itemId: "cmd-watch",
        processId: "proc-123",
        stdin: "",
      },
    },
    createdAt: new Date().toISOString(),
  });

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  await expect(chatScrollArea.getByText("agent 正在等待命令：pnpm dev")).toBeVisible();

  await installRealtimeInterruptMock(page, { windowKey: "__interruptRequest" });

  await interruptActiveTurnInStore(page);

  await expect
    .poll(() => page.evaluate(() => (window as any).__interruptRequest))
    .toMatchObject({
      type: "turn.interrupt",
      hostId: 1,
      threadId: "e2e-terminal-wait-thread",
      turnId: "turn-terminal",
    });
});
