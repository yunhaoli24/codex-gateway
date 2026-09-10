import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import { gatewayEventFromNotification } from "./helpers/canonical-event";
import {
  applyGatewayLiveEvent,
  dismissPlanPrompt,
  installSelectedThreadGoalControlMock,
  installSelectedThreadGoalSubmitMock,
  seedGatewayThread,
  setThreadCollaborationMode,
} from "./helpers/gateway-store";

test("goal slash input derives the goal tag and requires an objective before submitting", async ({
  page,
}) => {
  await openApp(page);
  await seedGatewayThread(page, {
    threadId: "e2e-goal-slash-thread",
    currentThread: { id: "e2e-goal-slash-thread", name: "Goal Slash" },
    history: { thread: { id: "e2e-goal-slash-thread", turns: [] } },
  });
  await installSelectedThreadGoalSubmitMock(page, {
    hostId: 1,
    threadId: "e2e-goal-slash-thread",
  });

  const composer = page.getByPlaceholder("输入后续修改要求");
  await composer.fill("/goal");
  await expect(
    page.getByTestId("composer-mode-strip").getByText("目标", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("slash-command-goal-objective")).toBeVisible();
  await expect(
    page.getByTestId("slash-command-goal-objective").getByText("设置目标"),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(composer).toHaveAttribute("data-value", "/goal ");
  await page.keyboard.press("Enter");
  await expect(composer).toHaveAttribute("data-value", "/goal ");
  await expect(page.getByText("请输入目标内容")).toBeVisible();
  await expect(page.getByTestId("chat-scroll-area").getByText("请输入目标内容")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__codexGatewayE2e?.captures.goalObjective ?? null))
    .toBeNull();

  await composer.fill("/goal 完成当前重构");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.__codexGatewayE2e?.captures.goalObjective))
    .toBe("完成当前重构");
  await expect(composer).toHaveAttribute("data-value", "");
  await expect(
    page.getByTestId("composer-mode-strip").getByText("完成当前重构").first(),
  ).toBeVisible();
  await expect(page.getByTestId("thread-goal-item").getByText("完成当前重构")).toBeVisible();
  await expect(page.locator(".thread-user-message", { hasText: "/goal 完成当前重构" })).toHaveCount(
    0,
  );
});

test("goal controls are shared by the slash menu and details dialog", async ({ page }) => {
  await openApp(page);
  const threadId = "e2e-goal-controls-thread";
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Goal Controls" },
    history: { thread: { id: threadId, turns: [] } },
  });
  await installSelectedThreadGoalSubmitMock(page, {
    hostId: 1,
    threadId,
  });
  await installSelectedThreadGoalControlMock(page, {
    hostId: 1,
    threadId,
  });

  const composer = page.getByPlaceholder("输入后续修改要求");
  await composer.fill("/goal 保持目标控制清晰");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.__codexGatewayE2e?.captures.goalObjective))
    .toBe("保持目标控制清晰");

  await composer.fill("/goal");
  await expect(page.getByTestId("slash-command-goal-edit")).toBeVisible();
  await expect(page.getByTestId("slash-command-goal-pause")).toBeVisible();
  await expect(page.getByTestId("slash-command-goal-clear")).toBeVisible();
  await expect(page.locator('[data-testid="slash-command-goal-stop"]')).toHaveCount(0);

  await page.getByTestId("slash-command-goal-pause").click();
  await expect
    .poll(() => page.evaluate(() => window.__codexGatewayE2e?.captures.goalControls))
    .toEqual([{ type: "status", status: "paused" }]);
  await expect(page.getByTestId("composer-goal-summary")).toBeVisible();
  await expect(page.getByTestId("composer-goal-summary").getByText("Paused")).toBeVisible();

  await composer.fill("/goal");
  await expect(page.getByTestId("slash-command-goal-resume")).toBeVisible();
  await page.getByTestId("slash-command-goal-resume").click();
  await expect
    .poll(() => page.evaluate(() => window.__codexGatewayE2e?.captures.goalControls))
    .toEqual([
      { type: "status", status: "paused" },
      { type: "status", status: "active" },
    ]);

  await composer.fill("");
  await page.getByTestId("composer-goal-summary").click();
  const goalDialog = page.getByRole("dialog");
  await expect(goalDialog.getByTestId("goal-details-edit")).toBeVisible();
  await expect(goalDialog.getByTestId("goal-details-stop")).toBeVisible();
  await expect(goalDialog.getByTestId("goal-details-clear")).toBeVisible();
  await goalDialog.getByTestId("goal-details-edit").click();
  const objectiveInput = goalDialog.getByTestId("goal-details-objective-input");
  await expect(objectiveInput).toHaveValue("保持目标控制清晰");
  await objectiveInput.fill("在目标详情中直接编辑");
  await goalDialog.getByTestId("goal-details-edit-save").click();
  await expect
    .poll(() => page.evaluate(() => window.__codexGatewayE2e?.captures.goalObjective))
    .toBe("在目标详情中直接编辑");
  await expect(objectiveInput).toHaveCount(0);
  await expect(goalDialog.getByText("在目标详情中直接编辑")).toBeVisible();
  await expect(composer).toHaveAttribute("data-value", "");

  await goalDialog.getByTestId("goal-details-stop").click();
  await expect
    .poll(() => page.evaluate(() => window.__codexGatewayE2e?.captures.goalControls))
    .toEqual([
      { type: "status", status: "paused" },
      { type: "status", status: "active" },
      { type: "status", status: "paused" },
    ]);
  await expect(goalDialog.getByTestId("goal-details-resume")).toBeVisible();
  await goalDialog.getByTestId("goal-details-resume").click();
  await page.getByRole("dialog").getByTestId("goal-details-clear").click();
  await expect
    .poll(() => page.evaluate(() => window.__codexGatewayE2e?.captures.goalControls))
    .toEqual([
      { type: "status", status: "paused" },
      { type: "status", status: "active" },
      { type: "status", status: "paused" },
      { type: "status", status: "active" },
      { type: "clear" },
    ]);
  await expect(page.getByTestId("composer-mode-strip")).toHaveCount(0);
});

test("goal progress updates the composer status strip without flooding the agent loop", async ({
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

  const threadId = "e2e-goal-progress-thread";
  const goalCreatedAt = Date.now() - 4000;
  const goalObjective = "持续 **重构** 输入框状态\n\n- 保持滚动稳定";
  const goalPayload = (status: string, tokensUsed: number, timeUsedSeconds: number) => ({
    threadId,
    objective: goalObjective,
    status,
    tokenBudget: null,
    tokensUsed,
    timeUsedSeconds,
    createdAt: goalCreatedAt,
    updatedAt: Date.now(),
  });
  const goalUpdatedEvent = (id: number, goal: Record<string, unknown>) =>
    gatewayEventFromNotification({
      id,
      threadId,
      method: "thread/goal/updated",
      params: { threadId, turnId: "turn-goal-progress", goal },
    });
  await applyGatewayLiveEvent(page, goalUpdatedEvent(301, goalPayload("active", 128, 3)));
  await applyGatewayLiveEvent(page, goalUpdatedEvent(302, goalPayload("active", 256, 4)));

  const strip = page.getByTestId("composer-mode-strip");
  const goalSummary = page.getByTestId("composer-goal-summary");
  await expect(strip.getByText(/持续 \*\*重构\*\* 输入框状态/).first()).toBeVisible();
  await expect(strip.getByText(/256 tokens/).first()).toBeVisible();
  await expect(goalSummary).toHaveAttribute("data-goal-status", "active");
  const goalCards = page.getByTestId("thread-goal-item");
  await expect(goalCards).toHaveCount(0);
  await expect(page.locator(".thread-user-message", { hasText: "/goal 持续" })).toHaveCount(0);
  await goalSummary.click();
  const goalDialog = page.getByRole("dialog");
  await expect(goalDialog.getByText("目标详情")).toBeVisible();
  await expect(goalDialog.locator(".markdown-content strong").getByText("重构")).toBeVisible();
  await expect(goalDialog.getByText("保持滚动稳定")).toBeVisible();
  await expect(page.getByTestId("chat-scroll-area").getByText("目标已更新")).toHaveCount(0);

  await applyGatewayLiveEvent(page, goalUpdatedEvent(303, goalPayload("blocked", 384, 6)));

  await expect(goalSummary).toHaveAttribute("data-goal-status", "blocked");
  await expect(goalSummary).toHaveClass(/bg-destructive\/10/);

  await applyGatewayLiveEvent(page, goalUpdatedEvent(304, goalPayload("complete", 512, 8)));

  await expect(page.getByTestId("composer-goal-summary")).toHaveCount(0);
  await expect(page.getByTestId("composer-mode-strip")).toHaveCount(0);
  await expect(page.getByTestId("chat-scroll-area").getByText("目标已更新")).toHaveCount(0);
  await expect(goalCards).toHaveCount(0);

  const composer = page.getByPlaceholder("输入后续修改要求");
  await composer.fill("/goal");
  await expect(page.getByTestId("slash-command-goal-objective")).toBeVisible();
  await expect(page.getByTestId("slash-command-goal-edit")).toHaveCount(0);
});

test("goal snapshot updates only the composer status strip without fabricating history", async ({
  page,
}) => {
  await openApp(page);
  const threadId = "e2e-goal-snapshot-thread";
  await seedGatewayThread(page, {
    threadId,
    currentThread: { id: threadId, name: "Goal Snapshot" },
    history: { thread: { id: threadId, turns: [] } },
  });

  await page.evaluate(
    (input) => {
      const composer = window.__codexGatewayE2e?.composer;
      if (!composer) throw new Error("Gateway E2E driver is unavailable");
      composer.upsertThreadGoal(input.hostId, input.threadId, {
        threadId: input.threadId,
        objective: "从 app-server 快照恢复当前目标",
        status: "active",
        tokenBudget: 1000,
        tokensUsed: 42,
        timeUsedSeconds: 5,
        createdAt: Date.now() - 5000,
        updatedAt: Date.now(),
      });
    },
    { hostId: 1, threadId },
  );

  await expect(
    page.getByTestId("composer-mode-strip").getByText("从 app-server 快照恢复当前目标").first(),
  ).toBeVisible();
  await expect(page.getByTestId("thread-goal-item")).toHaveCount(0);
});

test("plan mode shows implementation actions for a second completed turn plan", async ({
  page,
}) => {
  await openApp(page);
  await seedGatewayThread(page, {
    threadId: "e2e-repeat-plan-thread",
    currentThread: { id: "e2e-repeat-plan-thread", name: "Repeat Plan" },
    threadSettings: { model: "gpt-5.6-luna" },
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
  await setThreadCollaborationMode(page, {
    hostId: 1,
    threadId: "e2e-repeat-plan-thread",
    mode: "plan",
  });
  await dismissPlanPrompt(page, {
    hostId: 1,
    threadId: "e2e-repeat-plan-thread",
    planItemId: "plan-1",
  });

  await expect(page.getByText("first plan")).toBeVisible();
  await expect(
    page.getByTestId("chat-scroll-area").getByText("second plan", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("composer-mode-strip").getByText("计划模式", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("composer-mode-strip").getByText("second plan", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("checked constraints before second plan")).toBeHidden();
  await expect(page.getByRole("button", { name: "执行计划" })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续计划" })).toBeVisible();
});
