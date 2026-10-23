import { expect, test } from "@playwright/test";
import type { ThreadGoalStatus } from "../../shared/types";
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

test("validates, creates, edits, pauses, resumes and clears a Goal through its controls", async ({
  page,
}) => {
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

  await composer.fill("/goal 保持目标控制清晰");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.__codexGatewayE2e?.captures.goalObjective))
    .toBe("保持目标控制清晰");
  await expect(composer).toHaveAttribute("data-value", "");
  await expect(
    page.getByTestId("composer-mode-strip").getByText("保持目标控制清晰").first(),
  ).toBeVisible();
  await expect(page.getByTestId("thread-goal-item").getByText("保持目标控制清晰")).toBeVisible();
  await expect(
    page.locator(".thread-user-message", { hasText: "/goal 保持目标控制清晰" }),
  ).toHaveCount(0);
  // Continue controlling the Goal just created above rather than creating it a second time.
  await installSelectedThreadGoalControlMock(page, {
    hostId: 1,
    threadId,
  });

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

test("restores a Goal snapshot and applies progress without flooding the agent loop", async ({
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
  const goalPayload = (status: ThreadGoalStatus, tokensUsed: number, timeUsedSeconds: number) => ({
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
  // Restoring initial state and receiving later progress belong to the same user journey.
  await page.evaluate(
    (goal) => {
      const composer = window.__codexGatewayE2e?.composer;
      if (!composer) throw new Error("Gateway E2E driver is unavailable");
      composer.upsertThreadGoal(1, goal.threadId, goal);
    },
    { ...goalPayload("active", 42, 5), tokenBudget: 1000 },
  );
  await expect(page.getByTestId("composer-goal-summary")).toContainText(
    goalObjective.split("\n")[0]!,
  );
  await expect(page.getByTestId("thread-goal-item")).toHaveCount(0);

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

test("plan mode shows implementation actions for a second completed turn plan", async ({
  page,
}) => {
  await openApp(page);
  await seedGatewayThread(page, {
    threadId: "e2e-repeat-plan-thread",
    currentThread: { id: "e2e-repeat-plan-thread", name: "Repeat Plan" },
    threadSettings: { model: "gpt-6-luna" },
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
