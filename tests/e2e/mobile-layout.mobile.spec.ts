import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/remote-workspace";
import { authenticatedFetch, openApp, reloadApp } from "./helpers/app";
import { hostRecordSchema, projectRecordSchema } from "./helpers/http-schemas";
import {
  appendAgentStreamLines,
  installSelectedThreadGoalSubmitMock,
  seedGatewayThread,
} from "./helpers/gateway-store";
import { defaultGatewayHost } from "./fixtures/thread-history";
import { gatewayThreadFixture } from "./fixtures/gateway-thread";
import {
  buildTextTurns,
  frameSpread,
  installDeferredThreadTimelineLoadStub,
  requestOlderTurnsFromStore,
  releaseDeferredThreadTimelineLoad,
  startBottomDistanceTracking,
  startLocatorTopTracking,
  stopFrameTracking,
  threadTurnCount,
  threadTimelineLoadRequests,
  waitForAnimationFrames,
} from "./helpers/history-pagination";
import {
  captureVisibleTimelineRowAnchor,
  continueChatTouchScrollUp,
  continueChatTouchMomentumUp,
  endChatTouchScroll,
  expectSyntheticWebKitTouchToRemainReadable,
  scrollChatViewportToTop,
  startChatTouchScrollUp,
  visibleTimelineRowTop,
  waitForScrollableChatViewportAtBottom,
  waitForChatScrollToSettle,
} from "./helpers/scroll";
import {
  addRemoteHost,
  execRemoteSsh,
  type RemoteCodexEnv,
  waitForSelectedThreadId,
} from "./helpers/remote-codex";

test("uses the mobile layout with hidden sidebar, composer shell, and host management", async ({
  page,
  remoteWorkspace,
}, testInfo) => {
  await openApp(page);

  await expect(page.getByTestId("mobile-layout")).toBeVisible();
  await expect(page.getByTestId("desktop-layout")).toBeHidden();
  await expect(page.getByTestId("settings-toggle")).toBeHidden();

  await page.getByTestId("mobile-sidebar-toggle").click();
  await expect(page.getByTestId("settings-toggle")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-toggle")).toBeHidden();

  await expect(page.getByTestId("chat-scroll-area")).toBeVisible();
  await expect(page.getByText("先选择一个项目")).toBeVisible();

  await page.getByTestId("mobile-sidebar-toggle").click();
  const host = await addRemoteHost(page, remoteWorkspace.remote, `mobile-host-${Date.now()}`, {
    waitForConnection: false,
  });
  if (!(await page.getByTestId("settings-toggle").isVisible())) {
    await page.getByTestId("mobile-sidebar-toggle").click();
  }
  await page.getByTestId("settings-toggle").click();
  await page.getByRole("tab", { name: "主机", exact: true }).click();
  await expect(page.getByTestId("host-name-input")).toBeHidden();
  await expect(page.getByTestId(`host-management-status-${host.id}`)).toHaveAttribute(
    "data-status",
    "connected",
  );
  await expect(page.getByTestId(`host-daemon-restart-${host.id}`)).toBeVisible();
  const dialog = page.getByTestId("settings-dialog");
  expect(
    await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  await dialog.screenshot({ path: testInfo.outputPath("host-management-mobile.png") });
  await page.getByTestId(`host-edit-toggle-${host.id}`).click();
  await expect(
    page
      .getByTestId(`host-edit-form-${host.id}`)
      .getByRole("textbox", { name: "名称", exact: true }),
  ).toHaveValue(host.name);
  await page.keyboard.press("Escape");
});

test("shows model, effort and context with an expandable mobile approval menu", async ({
  page,
}) => {
  await openApp(page);
  await page.route("**/api/threads/settings", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  const threadId = "mobile-composer-settings";
  const tokenBreakdown = {
    totalTokens: 50_000,
    inputTokens: 45_000,
    cachedInputTokens: 20_000,
    cacheWriteInputTokens: 0,
    outputTokens: 5_000,
    reasoningOutputTokens: 2_000,
  };
  await seedGatewayThread(page, {
    cwd: "/tmp/e2e",
    threadId,
    currentThread: { id: threadId, name: "Mobile composer settings" },
    threadSettings: { model: "gpt-6-luna", effort: "medium", approvalPolicy: "never" },
    models: [
      {
        id: "gpt-6-luna",
        model: "gpt-6-luna",
        displayName: "GPT-5.6 Luna",
        supportedReasoningEfforts: [
          { reasoningEffort: "low" },
          { reasoningEffort: "medium" },
          { reasoningEffort: "high" },
        ],
      },
      {
        id: "gpt-5.6-sol",
        model: "gpt-5.6-sol",
        displayName: "GPT-5.6 Sol",
      },
    ],
    tokenUsage: {
      total: tokenBreakdown,
      last: tokenBreakdown,
      modelContextWindow: 100_000,
    },
  });

  await expect(page.getByTestId("model-select")).toContainText("GPT-5.6 Luna");
  await expect(page.getByTestId("model-select")).toContainText("Medium");
  await expect(page.getByText("完全访问", { exact: true })).toBeHidden();
  const contextMeter = page.getByTestId("context-usage-meter");
  await expect(contextMeter).toBeVisible();
  await expect(contextMeter).toHaveAttribute("aria-label", "上下文用量 50%");
  await expect(contextMeter.getByText("50%", { exact: true })).toBeHidden();

  await page.getByTestId("approval-policy-trigger").click();
  await expect(page.getByText("Codex 操作应该如何审批？", { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-slot="popover-content"]').getByRole("button", { name: /完全访问/ }),
  ).toBeVisible();
  await page.getByTestId("model-select").click();
  await expect(page.getByText("Codex 操作应该如何审批？", { exact: true })).toBeHidden();

  const modelSearch = page.getByPlaceholder("搜索模型或推理强度");
  await expect(modelSearch).toBeVisible();
  await expect(modelSearch).not.toBeFocused();
  await modelSearch.click();
  await expect(modelSearch).toBeFocused();
  await modelSearch.fill("luna");
  await expect(page.getByTestId("model-option-gpt-6-luna")).toBeVisible();
  await expect(page.getByTestId("model-option-gpt-5.6-sol")).toBeHidden();
  await modelSearch.fill("");

  await page.getByText("High", { exact: true }).click();
  await expect(modelSearch).toBeVisible();
  await expect(page.getByTestId("model-select")).toContainText("High");
  await page.getByTestId("model-option-gpt-5.6-sol").click();
  await expect(modelSearch).toBeVisible();
  await expect(page.getByTestId("model-select")).toContainText("GPT-5.6 Sol");

  await page.getByTestId("model-selector-close").click();
  await expect(modelSearch).toBeHidden();
  await page.getByTestId("model-select").click();
  await expect(modelSearch).toBeVisible();
  await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 4, y: 4 } });
  await expect(modelSearch).toBeHidden();

  await page.locator('input[type="file"]').setInputFiles({
    name: "mobile-preview.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByAltText("mobile-preview.png")).toBeVisible();
  await page.getByRole("button", { name: "移除附件" }).click();
  await expect(page.getByAltText("mobile-preview.png")).toHaveCount(0);
});

test("gives the Goal objective most of the mobile details dialog", async ({ page }) => {
  await openApp(page);
  const threadId = "mobile-goal-details-layout";
  await seedGatewayThread(page, {
    cwd: "/tmp/e2e",
    threadId,
    currentThread: { id: threadId, name: "Mobile Goal details" },
  });
  await installSelectedThreadGoalSubmitMock(page, { hostId: 1, threadId });

  const longObjective = "移动端目标正文需要保留足够的阅读空间。".repeat(40);
  const composer = page.getByPlaceholder("输入后续修改要求");
  await composer.fill(`/goal ${longObjective}`);
  await page.keyboard.press("Enter");
  await page.getByTestId("composer-goal-summary").click();

  const dialog = page.getByTestId("goal-details-dialog");
  const objective = dialog.getByTestId("goal-details-objective");
  const stats = dialog.getByTestId("goal-details-stats");
  const footer = dialog.getByTestId("goal-details-footer");
  await expect(dialog).toBeVisible();
  await expect(objective).toBeVisible();
  await expect(stats).toBeVisible();
  await expect(footer).toBeVisible();

  const [dialogBox, objectiveBox, statBoxes, actionBoxes] = await Promise.all([
    dialog.boundingBox(),
    objective.boundingBox(),
    stats
      .locator(":scope > div")
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top)),
    Promise.all(
      ["goal-details-edit", "goal-details-stop", "goal-details-clear"].map((testId) =>
        dialog.getByTestId(testId).boundingBox(),
      ),
    ),
  ]);
  expect(dialogBox).not.toBeNull();
  expect(objectiveBox).not.toBeNull();
  expect(objectiveBox!.height).toBeGreaterThan(dialogBox!.height * 0.5);
  expect(Math.max(...statBoxes) - Math.min(...statBoxes)).toBeLessThanOrEqual(1);
  expect(actionBoxes.every((box) => box !== null)).toBe(true);
  const actionTops = actionBoxes.map((box) => box!.y);
  expect(Math.max(...actionTops) - Math.min(...actionTops)).toBeLessThanOrEqual(1);
});

test("virtualizes a large running turn in one agent timeline", async ({ page }, testInfo) => {
  await openApp(page);
  // openApp may reset persisted E2E config by navigating once. WebKit reports an HTTP request
  // cancelled by that deliberate navigation as a page-level CORS error, although it belongs to
  // the discarded document. Start diagnostics after the stable test document is ready so every
  // error produced by the large timeline itself remains a hard failure.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const threadId = "mobile-large-running-turn";
  const commands = Array.from({ length: 351 }, (_, index) => ({
    type: "commandExecution",
    id: `large-command-${index}`,
    command: `large command ${index}`,
    aggregatedOutput: `output-${index} ${"x".repeat(4_000)}`,
    status: "completed",
    exitCode: 0,
  }));
  const fileChanges = Array.from({ length: 91 }, (_, index) => ({
    type: "fileChange",
    id: `large-file-change-${index}`,
    status: "completed",
    changes: [
      {
        path: `src/large_file_${index}.py`,
        kind: "update",
        diff: [
          `diff --git a/src/large_file_${index}.py b/src/large_file_${index}.py`,
          `--- a/src/large_file_${index}.py`,
          `+++ b/src/large_file_${index}.py`,
          "@@ -1,20 +1,20 @@",
          ...Array.from({ length: 20 }, (_, line) => `-old_value_${line} = ${line}`),
          ...Array.from({ length: 20 }, (_, line) => `+new_value_${line} = ${line + index}`),
        ].join("\n"),
      },
    ],
  }));
  const agentMessages = Array.from({ length: 97 }, (_, index) => ({
    type: "agentMessage",
    id: `large-agent-message-${index}`,
    text: `Agent progress ${index}: ${"analysis ".repeat(40)}`,
  }));
  const lifecycleProbe = {
    type: "commandExecution",
    id: "large-command-lifecycle-probe",
    command: "large command lifecycle probe",
    aggregatedOutput: `lifecycle-probe-output ${"x".repeat(4_000)}`,
    status: "completed",
    exitCode: 0,
  };
  await seedGatewayThread(page, {
    cwd: "/tmp/e2e",
    threadId,
    currentThread: { id: threadId, name: "Large mobile turn" },
    status: "running",
    history: {
      thread: {
        id: threadId,
        turns: [
          {
            id: "large-running-turn",
            status: "inProgress",
            items: [...commands, ...agentMessages, ...fileChanges, lifecycleProbe],
          },
        ],
      },
    },
  });

  const timeline = page.getByTestId("chat-scroll-area");
  const mountedRows = timeline.locator("[data-row-key]");
  await expect(page.getByTestId("virtual-intermediate-items")).toHaveCount(0);
  await expect.poll(() => mountedRows.count()).toBeLessThan(30);

  // Use the final row as a stable lifecycle probe. Deep estimated rows can move while WebKit
  // replaces preceding estimates, which is expected virtualizer behavior rather than a leak.
  const commandTitle = page.getByText("large command lifecycle probe", { exact: true });
  await expect(commandTitle).toBeVisible();
  await expect(page.getByText(/lifecycle-probe-output/)).toHaveCount(0);
  const commandRow = commandTitle.locator("xpath=ancestor::*[@data-index][1]");
  const commandRowHandle = await commandRow.elementHandle();
  if (commandRowHandle === null) throw new Error("Expected mounted command row");

  const fileChange = page.getByRole("button", { name: /src\/large_file_/ }).first();
  await expect(fileChange).toBeVisible();
  // Visible file cards start expanded, but outer timeline virtualization must limit expensive
  // highlighters to the viewport neighborhood instead of mounting all 91 file changes.
  const mountedDiffs = page.locator(".diff-markdown .syntax-highlight");
  await expect.poll(() => mountedDiffs.count()).toBeGreaterThan(0);
  await expect.poll(() => mountedDiffs.count()).toBeLessThan(30);

  // Move to the opposite end after capturing a real mounted node. This verifies outer timeline
  // virtualization directly without relying on an estimated offset inside the 500-row document.
  if (testInfo.project.name === "mobile-webkit-core-scroll") {
    await startChatTouchScrollUp(page, 1_000_000_000);
    await endChatTouchScroll(page);
    await waitForChatScrollToSettle(page);
    // The touch gesture establishes real detached intent. Once WebKit has flushed its deferred
    // measurement corrections, move to the exact boundary to test row destruction rather than
    // asserting that a synthetic one-frame gesture reproduces native momentum distance.
    await scrollChatViewportToTop(page);
  } else {
    await scrollChatViewportToTop(page);
  }
  await expect(page.getByTestId("chat-scroll-area")).toHaveAttribute("data-follow-latest", "false");
  await waitForChatScrollToSettle(page);
  await expect(page.getByText("large command lifecycle probe", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/lifecycle-probe-output/)).toHaveCount(0);
  await expect(mountedDiffs).toHaveCount(0);
  expect(await commandRowHandle.evaluate((element) => element.isConnected)).toBe(false);
  await expect.poll(() => mountedRows.count()).toBeLessThan(30);
  const resizeObserverErrors = pageErrors.filter((message) =>
    message.includes("ResizeObserver loop"),
  );
  // WebKit reports one delayed ResizeObserver delivery as a pageerror when a virtual document
  // jumps between its ends. It can report the same browser diagnostic more than once when several
  // observer batches settle together; the rows are delivered on the next frame and the browser
  // exposes no cancellation API. Chromium must remain warning-free and every distinct page error
  // still fails.
  if (testInfo.project.name === "mobile-webkit-core-scroll") {
    expect(
      resizeObserverErrors.every(
        (message) => message === "ResizeObserver loop completed with undelivered notifications.",
      ),
    ).toBe(true);
  } else {
    expect(resizeObserverErrors).toEqual([]);
  }
  expect(pageErrors.filter((message) => !message.includes("ResizeObserver loop"))).toEqual([]);
});

test("explicit history prepend keeps the mobile timeline visually stable", async ({ page }) => {
  await openApp(page);
  const threadId = "mobile-explicit-history-prepend";
  await installDeferredThreadTimelineLoadStub(page, {
    history: {
      thread: { id: threadId, turns: buildTextTurns(1, 3, "mobile top-up turn", 14) },
    },
    nextCursor: null,
  });
  await seedGatewayThread(page, {
    cwd: "/tmp/e2e",
    threadId,
    currentThread: { id: threadId, name: "Mobile Top Up" },
    oldestTimelineCursor: "cursor-before-oldest",
    history: {
      thread: { id: threadId, turns: buildTextTurns(4, 5, "mobile top-up turn", 14) },
    },
  });

  const latestRow = page.locator('[data-row-key*=":turn-turn-005:"][data-row-section="final"]');
  await expect(latestRow).toBeVisible();
  await page.waitForTimeout(250);
  expect(await threadTimelineLoadRequests(page)).toHaveLength(0);
  await startLocatorTopTracking(latestRow);
  await requestOlderTurnsFromStore(page);
  await expect
    .poll(() => threadTimelineLoadRequests(page).then((requests) => requests.length))
    .toBe(1);
  await releaseDeferredThreadTimelineLoad(page);
  await expect.poll(() => threadTurnCount(page)).toBe(5);
  await waitForAnimationFrames(page, 8);
  const samples = await stopFrameTracking(page);
  expect(frameSpread(samples), JSON.stringify(samples)).toBeLessThanOrEqual(2);
});

test("mobile viewport resize during explicit history prepend stays bottom pinned", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "mobile-resizing-history-prepend";
  await installDeferredThreadTimelineLoadStub(page, {
    history: {
      thread: { id: threadId, turns: buildTextTurns(1, 3, "mobile resize turn", 14) },
    },
    nextCursor: null,
  });
  await seedGatewayThread(page, {
    cwd: "/tmp/e2e",
    threadId,
    currentThread: { id: threadId, name: "Mobile Resize Top Up" },
    oldestTimelineCursor: "cursor-before-oldest",
    history: {
      thread: { id: threadId, turns: buildTextTurns(4, 5, "mobile resize turn", 14) },
    },
  });

  await page.waitForTimeout(250);
  expect(await threadTimelineLoadRequests(page)).toHaveLength(0);
  await startBottomDistanceTracking(page);
  await requestOlderTurnsFromStore(page);
  await expect
    .poll(() => threadTimelineLoadRequests(page).then((requests) => requests.length))
    .toBe(1);
  await releaseDeferredThreadTimelineLoad(page);
  await page.setViewportSize({ width: 393, height: 820 });
  await expect.poll(() => threadTurnCount(page)).toBe(5);
  await waitForAnimationFrames(page, 8);
  const samples = await stopFrameTracking(page);
  // Playwright changes Chromium's external viewport before the page receives its corresponding
  // resize/ResizeObserver delivery. Depending on browser scheduling, multiple rAF samples can
  // therefore expose the same old 35px bottom distance even though the application has not had a
  // resize callback yet. Validate the behavior we own: correction happens within a bounded prefix
  // and, once settled, never oscillates or starts another compensation cascade.
  const firstSettledFrame = samples.findIndex((distance) => distance <= 2);
  expect(firstSettledFrame, JSON.stringify(samples)).toBeGreaterThanOrEqual(0);
  expect(firstSettledFrame, JSON.stringify(samples)).toBeLessThanOrEqual(3);
  expect(
    Math.max(...samples.slice(firstSettledFrame)),
    JSON.stringify(samples),
  ).toBeLessThanOrEqual(2);
});

test("mobile touch scrolling stays anchored while Agent output streams", async ({
  page,
}, testInfo) => {
  await openApp(page);
  const threadId = "mobile-active-touch-stream";
  await seedGatewayThread(page, {
    cwd: "/tmp/e2e",
    threadId,
    currentThread: { id: threadId, name: "Active Touch Stream" },
    status: "running",
    history: {
      thread: {
        id: threadId,
        turns: [
          ...buildTextTurns(1, 28, "touch scroll history", 12),
          {
            id: "turn-touch-streaming",
            status: "running",
            items: [
              {
                id: "agent-touch-streaming",
                type: "agentMessage",
                status: "inProgress",
                text: "touch stream initial output",
              },
            ],
          },
        ],
      },
    },
  });

  await expect(page.getByText("touch stream initial output")).toBeVisible();
  await waitForScrollableChatViewportAtBottom(page);
  const initialGesture = await startChatTouchScrollUp(page, 180);
  expect(initialGesture.before - initialGesture.after).toBeGreaterThan(80);
  let finalAnchor: Awaited<ReturnType<typeof captureVisibleTimelineRowAnchor>> | null = null;
  for (let batch = 0; batch < 3; batch += 1) {
    if (batch > 0) {
      const continuedGesture = await continueChatTouchScrollUp(page, 180, 520 + batch * 200);
      expect(continuedGesture.before - continuedGesture.after).toBeGreaterThan(80);
    }
    finalAnchor = await captureVisibleTimelineRowAnchor(page);
    await appendAgentStreamLines(page, {
      itemId: "agent-touch-streaming",
      prefix: `touch stream batch ${batch + 1}`,
      count: 8,
    });
    await waitForAnimationFrames(page, 2);

    // Do not assert an exact anchor while the finger is down. WebKit owns the viewport during
    // this phase and TanStack deliberately queues measurement compensation so it does not cancel
    // native scrolling. The critical contract during the gesture is that streaming never takes
    // control and reattaches the reader to the bottom.
    if (testInfo.project.name !== "mobile-webkit-core-scroll") {
      await expect(page.getByTestId("chat-scroll-area")).toHaveAttribute(
        "data-follow-latest",
        "false",
      );
    }
  }
  await endChatTouchScroll(page);
  await waitForChatScrollToSettle(page);
  expect(finalAnchor).not.toBeNull();
  if (testInfo.project.name === "mobile-webkit-core-scroll") {
    await expectSyntheticWebKitTouchToRemainReadable(page);
    return;
  }
  await expect
    .poll(() => visibleTimelineRowTop(page, finalAnchor!.key))
    .toBeGreaterThanOrEqual(finalAnchor!.top - 2);
  await expect
    .poll(() => visibleTimelineRowTop(page, finalAnchor!.key))
    .toBeLessThanOrEqual(finalAnchor!.top + 2);
});

test("mobile momentum scrolling stays anchored after touchend while output streams", async ({
  page,
}, testInfo) => {
  await openApp(page);
  const threadId = "mobile-momentum-stream";
  await seedGatewayThread(page, {
    cwd: "/tmp/e2e",
    threadId,
    currentThread: { id: threadId, name: "Momentum Stream" },
    status: "running",
    history: {
      thread: {
        id: threadId,
        turns: [
          ...buildTextTurns(1, 30, "momentum history", 10),
          {
            id: "turn-momentum-streaming",
            status: "running",
            items: [
              {
                id: "agent-momentum-streaming",
                type: "agentMessage",
                status: "inProgress",
                text: "momentum stream initial output",
              },
            ],
          },
        ],
      },
    },
  });

  await expect(page.getByText("momentum stream initial output")).toBeVisible();
  await waitForScrollableChatViewportAtBottom(page);
  const initialGesture = await startChatTouchScrollUp(page, 220);
  expect(initialGesture.before - initialGesture.after).toBeGreaterThan(100);
  await endChatTouchScroll(page);
  await expect(page.getByTestId("chat-scroll-area")).toHaveAttribute("data-follow-latest", "false");

  let finalAnchor: Awaited<ReturnType<typeof captureVisibleTimelineRowAnchor>> | null = null;
  for (let frame = 0; frame < 3; frame += 1) {
    const momentum = await continueChatTouchMomentumUp(page, 90);
    expect(momentum.before - momentum.after).toBeGreaterThan(40);
    // Anchor the virtual row rather than a Markdown paragraph. WebKit may place a tall paragraph
    // across the viewport boundary during native momentum even though its containing row is the
    // stable, visible unit that TanStack measures and compensates.
    finalAnchor = await captureVisibleTimelineRowAnchor(page);
    await appendAgentStreamLines(page, {
      itemId: "agent-momentum-streaming",
      prefix: `momentum stream frame ${frame + 1}`,
      count: 8,
    });
    await waitForAnimationFrames(page, 2);

    // Momentum is still browser-owned scrolling. Exact compensation is expected only once the
    // scroll-end debounce fires; forcing it per frame would hide the iOS regression by replacing
    // native behavior with a test-only scroll state machine.
    if (testInfo.project.name !== "mobile-webkit-core-scroll") {
      await expect(page.getByTestId("chat-scroll-area")).toHaveAttribute(
        "data-follow-latest",
        "false",
      );
    }
  }
  await waitForChatScrollToSettle(page);
  expect(finalAnchor).not.toBeNull();
  if (testInfo.project.name === "mobile-webkit-core-scroll") {
    // Playwright cannot synthesize a native WebKit swipe/momentum gesture. This test models the
    // browser-owned phase with scrollTop writes, but Virtual Core intentionally defers dynamic-row
    // corrections until that phase settles. A row coordinate captured before the deferred flush
    // is therefore not a valid final anchor on WebKit. Keep the user-facing contract strict: the
    // timeline must remain detached, retain visible content, and stay away from the latest edge.
    await expectSyntheticWebKitTouchToRemainReadable(page);
    return;
  }
  await expect
    .poll(() => visibleTimelineRowTop(page, finalAnchor!.key))
    .toBeGreaterThanOrEqual(finalAnchor!.top - 2);
  await expect
    .poll(() => visibleTimelineRowTop(page, finalAnchor!.key))
    .toBeLessThanOrEqual(finalAnchor!.top + 2);
});

test("opens sidebar context actions with long press on mobile", async ({
  page,
  remoteWorkspace,
}) => {
  const { remote } = remoteWorkspace;
  await openApp(page);
  const { project } = await createConfiguredHostAndProject(page, remote);
  await reloadApp(page);

  if (
    !(await page
      .getByTestId("settings-toggle")
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByTestId("mobile-sidebar-toggle").click();
  }
  await expect(page.getByTestId(`project-button-${project.remotePath}`)).toBeVisible();
  await longPress(page, page.getByTestId(`project-button-${project.remotePath}`));
  await page.getByRole("menuitem", { name: /新建/ }).click();
  const threadId = await waitForSelectedThreadId(page);

  await page.getByTestId("mobile-sidebar-toggle").click();
  await page.getByTestId(`project-button-${project.remotePath}`).click();
  await expect(page.getByTestId("project-thread-list")).toBeVisible();
  await expect(page.getByTestId("open-tmux-mobile-button")).toBeVisible();
  await expect(page.getByTestId("open-host-monitor-mobile-button")).toBeVisible();
  await page.getByTestId("open-host-monitor-mobile-button").click();
  await expect(page.getByTestId("host-metrics-panel")).toBeVisible();
  await page.getByRole("tab", { name: /Agent/ }).click();
  await page.getByTestId("open-terminal-mobile-button").click();
  await expect(page.getByTestId("terminal-panel")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: /Agent/ }).click();
  await expect(page.getByTestId("project-thread-list")).toBeVisible();
  const threadButton = page.getByTestId(`project-thread-row-${threadId}`);
  await expect(threadButton).toBeVisible({ timeout: 30_000 });

  await longPress(page, threadButton);
  await page.getByRole("menuitem", { name: /置顶/ }).click();
  await page.getByTestId("mobile-sidebar-toggle").click();
  const pinnedThread = page.getByTestId(`pinned-thread-button-${threadId}`);
  await expect(pinnedThread).toBeVisible();

  await longPress(page, pinnedThread);
  await page.getByRole("menuitem", { name: /重命名/ }).click();
  await expect(page.getByTestId("rename-thread-dialog")).toBeVisible();
  await page.getByTestId("rename-thread-input").fill("Renamed mobile thread");
  await page.getByTestId("rename-thread-submit").click();
  await expect(pinnedThread).toContainText("Renamed mobile thread");
});

test("opens and closes the subagent side panel on mobile", async ({ page }) => {
  await openApp(page);
  const threadId = "mobile-parent-thread";
  const subThreadId = "mobile-subagent-thread";
  const parentThread = gatewayThreadFixture({ id: "mobile-parent-thread", name: "Mobile Parent" });
  const subAgentThread = gatewayThreadFixture({
    id: "mobile-subagent-thread",
    name: "Mobile Parent Inherited Name",
    agentNickname: "Scout",
    agentRole: "explorer",
  });
  await seedGatewayThread(page, {
    host: { ...defaultGatewayHost(1), name: "Mobile Host" },
    threadId,
    currentThread: parentThread,
    history: {
      thread: {
        id: threadId,
        turns: [
          {
            id: "mobile-parent-turn",
            status: "running",
            items: [
              {
                id: "mobile-subagent-activity",
                type: "subAgentActivity",
                kind: "started",
                agentThreadId: subThreadId,
                agentPath: subThreadId,
              },
            ],
          },
        ],
      },
    },
    threadViews: {
      "1:mobile-subagent-thread": {
        hostId: 1,
        cwd: subAgentThread.cwd,
        threadId: subThreadId,
        currentThread: subAgentThread,
        history: {
          thread: {
            id: subThreadId,
            turns: [
              {
                id: "mobile-sub-turn",
                status: "completed",
                items: [
                  {
                    id: "mobile-sub-agent",
                    type: "agentMessage",
                    phase: "final_answer",
                    text: "Mobile subagent timeline is readable.",
                  },
                ],
              },
            ],
          },
        },
        events: [],
        oldestTimelineCursor: null,
        lastEventId: 0,
        eventEpoch: "e2e-event-epoch",
        loading: false,
        error: null,
      },
    },
  });

  await openIntermediateSteps(page);
  await page.getByTestId("open-subagent-panel").click();
  const panel = page.getByTestId("workspace-subagent-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("workspace-panel-title")).toHaveText("Scout [explorer]");
  await expect(panel.getByText("Mobile subagent timeline is readable.")).toBeVisible();
  const panelBox = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(panelBox?.width).toBeGreaterThan((viewport?.width ?? 0) * 0.9);
  await page.getByRole("button", { name: "关闭标签页" }).last().click();
  await expect(panel).toBeHidden();
});

test("browses the current thread file workspace from a mobile sheet", async ({
  page,
  remoteWorkspace,
}) => {
  const { remote } = remoteWorkspace;
  await openApp(page);
  const rootPath = `/home/${remote.username}/mobile-file-project-${Date.now()}`;
  const { host, project } = await createConfiguredHostAndProject(page, remote, rootPath);
  const path = `${rootPath}/mobile-file-preview-${Date.now()}.md`;
  await execRemoteSsh(
    remote,
    `set -eu
mkdir -p ${shellQuote(rootPath)}
printf '%s\n' '# Mobile File Baseline' 'Committed before the current edit.' > ${shellQuote(path)}
git -C ${shellQuote(rootPath)} init -q
git -C ${shellQuote(rootPath)} config user.email codex-gateway-e2e@example.invalid
git -C ${shellQuote(rootPath)} config user.name 'Codex Gateway E2E'
git -C ${shellQuote(rootPath)} add -- ${shellQuote(path)}
git -C ${shellQuote(rootPath)} commit -qm 'test: establish mobile file baseline'
printf '%s\n' '# Mobile File Workspace' 'Rendered from the remote tree.' > ${shellQuote(path)}`,
  );
  const threadId = `mobile-file-thread-${Date.now()}`;
  await seedGatewayThread(page, {
    hostId: host.id,
    cwd: project.remotePath,
    host: { ...host },
    project: { ...project },
    threadId,
    currentThread: { id: threadId, name: "Mobile Files", cwd: rootPath },
    history: {
      thread: {
        id: threadId,
        turns: [
          {
            id: "mobile-file-edit-turn",
            status: "completed",
            items: [
              {
                id: "mobile-file-edit",
                type: "fileChange",
                status: "completed",
                changes: [
                  {
                    path,
                    kind: { type: "update" },
                    diff: "-# Mobile File Baseline\n+# Mobile File Workspace",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    status: "completed",
  });

  await page
    .getByRole("button", { name: /中间过程/ })
    .first()
    .click();
  await page.getByRole("button", { name: `打开文件：${path}` }).click();
  await expect(page.getByRole("button", { name: "向右分屏" })).toHaveCount(0);
  const panel = page.getByTestId("workspace-file-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".markdown-content h1")).toHaveText("Mobile File Workspace");
  await page.getByRole("button", { name: "文件树", exact: true }).click();
  const tree = page.getByTestId("remote-file-tree");
  await expect(tree).toBeVisible();
  await page.getByRole("tab", { name: /变更/ }).click();
  await expect(
    page.getByTestId("git-changes-tree").locator(`[data-git-change-path=${JSON.stringify(path)}]`),
  ).toContainText("M");
  await page.getByRole("button", { name: "打开完整变更审查" }).click();
  const reviewPanel = page.getByTestId("git-review-panel");
  await expect(reviewPanel).toBeVisible();
  await expect(tree).toBeHidden();
  await expect(reviewPanel.getByTestId("git-review-diff-editor")).toContainText(
    "Mobile File Baseline",
  );
  await page
    .getByRole("region", { name: "审查变更" })
    .getByRole("button", { name: "关闭标签页" })
    .click();
  await page.getByRole("button", { name: "文件树", exact: true }).click();
  await expect(tree).toBeVisible();
  await page.getByRole("tab", { name: "文件", exact: true }).click();
  await tree.getByText(path.split("/").pop()!, { exact: true }).click();
  await expect(panel.locator(".markdown-content h1")).toHaveText("Mobile File Workspace");
  await panel.getByRole("button", { name: "源码" }).click();
  await expect(panel.getByTestId("remote-file-editor")).toContainText("Mobile File Workspace");
  await panel.getByRole("button", { name: "变更", exact: true }).click();
  await expect(panel.getByTestId("remote-file-diff-editor")).toContainText("Mobile File Baseline");
  await expect(panel.getByTestId("remote-file-diff-editor")).toContainText("Mobile File Workspace");
  const panelBox = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(panelBox?.width).toBeLessThanOrEqual(viewport?.width ?? 0);
  await expect
    .poll(() =>
      panel
        .getByTestId("file-editor-toolbar")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    )
    .toBe(true);

  const plainRootPath = `/home/${remote.username}/mobile-plain-project-${Date.now()}`;
  await execRemoteSsh(remote, `mkdir -p ${shellQuote(plainRootPath)}`);
  const plainProject = await authenticatedFetch(
    page,
    {
      url: "/api/projects",
      method: "POST",
      body: {
        hostId: host.id,
        name: `mobile-plain-project-${Date.now()}`,
        remotePath: plainRootPath,
      },
    },
    (value) => projectRecordSchema.parse(value),
  );
  const plainThreadId = `mobile-plain-thread-${Date.now()}`;
  await seedGatewayThread(page, {
    hostId: host.id,
    cwd: plainProject.remotePath,
    host: { ...host },
    project: { ...plainProject },
    threadId: plainThreadId,
    currentThread: { id: plainThreadId, name: "Mobile Plain Files", cwd: plainRootPath },
    history: { thread: { id: plainThreadId, turns: [] } },
    status: "completed",
  });
  await page.locator('[data-testid="workspace-dock-tab"][data-panel-kind="files"]').click();
  await page.getByRole("button", { name: "文件树", exact: true }).click();
  await page.getByRole("tab", { name: /变更/ }).click();
  await expect(page.getByText("当前工作区不在 Git 仓库中", { exact: true })).toBeVisible();
});

async function openIntermediateSteps(page: Page) {
  const toggle = page.getByRole("button", { name: /中间过程/ }).first();
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("data-state")) !== "open") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("data-state", "open");
}

async function createConfiguredHostAndProject(
  page: Page,
  remote: RemoteCodexEnv,
  projectPath = remote.projectPath,
) {
  const host = await authenticatedFetch(
    page,
    {
      url: "/api/hosts",
      method: "POST",
      body: {
        name: `mobile-longpress-host-${Date.now()}`,
        sshHost: remote.host,
        username: remote.username,
        port: Number(remote.port),
        authMode: "password",
        password: remote.password,
        proxyUrl: remote.proxyUrl ?? null,
      },
    },
    (value) => hostRecordSchema.parse(value),
  );
  const project = await authenticatedFetch(
    page,
    {
      url: "/api/projects",
      method: "POST",
      body: {
        hostId: host.id,
        name: `mobile-longpress-project-${Date.now()}`,
        remotePath: projectPath,
      },
    },
    (value) => projectRecordSchema.parse(value),
  );
  return { host, project };
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function longPress(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  const clientX = box!.x + box!.width / 2;
  const clientY = box!.y + box!.height / 2;
  await locator.dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    button: 0,
    clientX,
    clientY,
  });
  await page.waitForTimeout(700);
  await locator.dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    button: 0,
    clientX,
    clientY,
  });
}
