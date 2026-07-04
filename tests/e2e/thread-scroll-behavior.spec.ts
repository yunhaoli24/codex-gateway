import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import {
  appendAgentStreamLines,
  appendCommandOutputLines,
  appendFileDiffLines,
  completeTurnWithFinalAgentMessage,
  seedGatewayThread,
} from "./helpers/gateway-store";
import {
  captureVisibleAgentLineAnchor,
  captureVisibleTextAnchor,
  chatViewportScrollTop,
  commandOutputScrollTop,
  detachChatViewportNearBottom,
  parkChatViewportInMiddle,
  parkCommandOutputInMiddle,
  scrollChatViewportToBottom,
  visibleAgentLineTop,
  visibleTextTop,
} from "./helpers/scroll";

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
