import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import { gatewayEventFromNotification } from "./helpers/canonical-event";
import {
  applyGatewayLiveEvent,
  capturedRealtimeInterrupt,
  capturedServerRequestResponse,
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
    cwd: "/tmp/e2e",
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
  });

  await page.getByTestId("dynamic-tool-submit").click();
  await expect
    .poll(() => capturedServerRequestResponse(page))
    .toMatchObject({
      hostId: 7,
      threadId: "e2e-dynamic-tool-thread",
      serverRequestId: 42,
      result: {
        contentItems: [{ type: "inputText", text: "" }],
        success: true,
      },
    });
  await expect(page.getByTestId("dynamic-tool-submit")).toBeEnabled();

  await installServerRequestResponderMock(page, {
    mode: "fail",
    message: "pending app-server request was not found",
  });

  await page.getByTestId("dynamic-tool-submit").click();
  await expect(page.getByText("pending app-server request was not found")).toBeVisible();
  await expect(
    page.getByTestId("chat-scroll-area").getByText("pending app-server request was not found"),
  ).toHaveCount(0);

  await applyGatewayLiveEvent(
    page,
    gatewayEventFromNotification({
      id: 43,
      hostId: 7,
      threadId,
      method: "serverRequest/resolved",
      params: { threadId, requestId: 42 },
    }),
  );
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
  await applyGatewayLiveEvent(
    page,
    gatewayEventFromNotification({
      id: 101,
      threadId,
      method: "error",
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
    }),
  );

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  await expect(page.getByText(/remote provider disconnected/)).toBeVisible();
  await expect(page.getByText(/错误类型：responseStreamDisconnected/)).toBeVisible();
  await expect(page.getByText(/app-server 正在自动重试/)).toBeVisible();
  await expect(chatScrollArea.getByText("remote provider disconnected")).toHaveCount(0);

  await applyGatewayLiveEvent(
    page,
    gatewayEventFromNotification({
      id: 102,
      threadId,
      method: "item/agentMessage/delta",
      params: {
        threadId,
        turnId: "turn-error",
        itemId: "agent-recovered",
        delta: "retry recovered",
      },
    }),
  );

  // A delta alone does not identify a final answer. Read the recovered text through the
  // intermediate section instead of relying on the reducer to invent an official phase.
  await chatScrollArea.getByRole("button", { name: /中间过程/ }).click();
  await expect(chatScrollArea.getByText("retry recovered")).toBeVisible();
});

test("app-server moderation notifications reveal their summary and details on demand", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-moderation-notification-thread";
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Moderation Notification" },
    history: { thread: { id: threadId, turns: [] } },
  });
  await applyGatewayLiveEvent(
    page,
    gatewayEventFromNotification({
      id: 201,
      threadId,
      method: "turn/moderationMetadata",
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
    }),
  );

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  const moderationToggle = chatScrollArea.getByRole("button", { name: /安全审查元数据/ });
  await expect(moderationToggle).toBeVisible();
  await expect(chatScrollArea.getByText(/flagged=true/)).toBeHidden();
  await moderationToggle.click();
  await expect(chatScrollArea.getByText(/flagged=true/)).toBeVisible();
  await expect(chatScrollArea.getByText(/categories=self_harm/)).toBeVisible();
  await expect(chatScrollArea.getByText("only visible after expanding details")).toBeHidden();
  await chatScrollArea.getByRole("button", { name: "查看详情" }).click();
  await expect(chatScrollArea.getByText("only visible after expanding details")).toBeVisible();
  await moderationToggle.click();
  await expect(chatScrollArea.getByText(/flagged=true/)).toBeHidden();
});

test("terminal wait notifications keep compact spacing and reveal the complete command", async ({
  page,
}) => {
  await openApp(page);
  const command =
    "git status --short; bash -n deploy/tests/cloudawn-gateway-smoke.sh; SUB2API_TEST_CASES=compact SUB2API_TEST_IMAGE=sub2api:0.2.18-cloudawn-native ./deploy/tests/cloudawn-gateway-smoke.sh";
  await seedGatewayThread(page, {
    threadId: "e2e-terminal-wait-thread",
    currentThread: { id: "e2e-terminal-wait-thread", name: "Terminal Wait" },
    status: "running",
    history: {
      thread: {
        id: "e2e-terminal-wait-thread",
        turns: [
          {
            id: "turn-terminal",
            status: "inProgress",
            items: [
              {
                id: "cmd-watch",
                type: "commandExecution",
                command: `/bin/bash -lc '${command}'`,
                cwd: "/workspace/codex-gateway",
                processId: "proc-123",
                status: "inProgress",
                aggregatedOutput: "",
                exitCode: null,
                durationMs: null,
              },
              // The reported real transcript completes both empty and whitespace-only assistant
              // items between tool calls. Reading it must not leave padded, invisible rows.
              { id: "empty-agent", type: "agentMessage", text: "" },
              { id: "whitespace-agent", type: "agentMessage", text: " " },
            ],
          },
        ],
      },
    },
  });
  await applyGatewayLiveEvent(
    page,
    gatewayEventFromNotification({
      id: 302,
      threadId: "e2e-terminal-wait-thread",
      method: "item/commandExecution/terminalInteraction",
      params: {
        threadId: "e2e-terminal-wait-thread",
        turnId: "turn-terminal",
        itemId: "cmd-watch",
        processId: "proc-123",
        stdin: "",
      },
    }),
  );

  const chatScrollArea = page.getByTestId("chat-scroll-area");
  const notification = chatScrollArea.locator('[data-row-key$="notification-302"]');
  const commandToggle = chatScrollArea.getByRole("button", { name: /^git status --short/ });
  await expect(notification.getByText("查看后台命令输出", { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const commandBounds = await commandToggle.boundingBox();
      const notificationBounds = await notification.boundingBox();
      return commandBounds && notificationBounds
        ? notificationBounds.y - commandBounds.y - commandBounds.height
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(48);
  await notification.getByRole("button", { name: "查看详情" }).click();
  await expect(notification.locator("pre")).toHaveText(`agent 正在等待命令：${command}`);
  await notification.getByRole("button", { name: "收起详情" }).click();
  await expect(notification.locator("pre")).toBeHidden();

  await installRealtimeInterruptMock(page);

  await interruptActiveTurnInStore(page);

  await expect
    .poll(() => capturedRealtimeInterrupt(page))
    .toMatchObject({
      type: "turn.interrupt",
      hostId: 1,
      threadId: "e2e-terminal-wait-thread",
      turnId: "turn-terminal",
    });
});
