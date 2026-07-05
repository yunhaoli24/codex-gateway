import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
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
    windowKey: "__submittedGoalObjective",
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
  await expect(composer).toHaveValue("/goal ");
  await page.keyboard.press("Enter");
  await expect(composer).toHaveValue("/goal ");
  await expect(page.getByTestId("chat-scroll-area").getByText("请输入目标内容")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__submittedGoalObjective ?? null))
    .toBeNull();

  await composer.fill("/goal 完成当前重构");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => (window as any).__submittedGoalObjective))
    .toBe("完成当前重构");
  await expect(composer).toHaveValue("");
  await expect(
    page.getByTestId("composer-mode-strip").getByText("完成当前重构").first(),
  ).toBeVisible();
  await expect(page.getByTestId("chat-scroll-area").getByText("/goal 完成当前重构")).toBeVisible();
});

test("goal slash menu exposes official app-server controls for an existing goal", async ({
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
    windowKey: "__submittedGoalObjective",
  });
  await installSelectedThreadGoalControlMock(page, {
    hostId: 1,
    threadId,
    windowKey: "__submittedGoalControls",
  });

  const composer = page.getByPlaceholder("输入后续修改要求");
  await composer.fill("/goal 保持目标控制清晰");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => (window as any).__submittedGoalObjective))
    .toBe("保持目标控制清晰");

  await composer.fill("/goal");
  await expect(page.getByTestId("slash-command-goal-edit")).toBeVisible();
  await expect(page.getByTestId("slash-command-goal-pause")).toBeVisible();
  await expect(page.getByTestId("slash-command-goal-clear")).toBeVisible();
  await expect(page.locator('[data-testid="slash-command-goal-stop"]')).toHaveCount(0);

  await page.getByTestId("slash-command-goal-pause").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__submittedGoalControls))
    .toEqual([{ type: "status", status: "paused" }]);

  await composer.fill("/goal");
  await expect(page.getByTestId("slash-command-goal-resume")).toBeVisible();
  await page.getByTestId("slash-command-goal-resume").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__submittedGoalControls))
    .toEqual([
      { type: "status", status: "paused" },
      { type: "status", status: "active" },
    ]);

  await composer.fill("/goal");
  await page.getByTestId("slash-command-goal-edit").click();
  await expect(composer).toHaveValue("/goal 保持目标控制清晰");

  await composer.fill("/goal");
  await page.getByTestId("slash-command-goal-clear").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__submittedGoalControls))
    .toEqual([
      { type: "status", status: "paused" },
      { type: "status", status: "active" },
      { type: "clear" },
    ]);
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
  await applyGatewayLiveEvent(page, {
    id: 301,
    hostId: 1,
    threadId,
    method: "thread/goal/updated",
    payload: {
      params: {
        threadId,
        turnId: "turn-goal-progress",
        goal: {
          threadId,
          objective: "持续 **重构** 输入框状态\n\n- 保持滚动稳定",
          status: "active",
          tokenBudget: null,
          tokensUsed: 128,
          timeUsedSeconds: 3,
          createdAt: Date.now() - 3000,
          updatedAt: Date.now(),
        },
      },
    },
    createdAt: new Date().toISOString(),
  });
  await applyGatewayLiveEvent(page, {
    id: 302,
    hostId: 1,
    threadId,
    method: "thread/goal/updated",
    payload: {
      params: {
        threadId,
        turnId: "turn-goal-progress",
        goal: {
          threadId,
          objective: "持续 **重构** 输入框状态\n\n- 保持滚动稳定",
          status: "active",
          tokenBudget: null,
          tokensUsed: 256,
          timeUsedSeconds: 4,
          createdAt: Date.now() - 4000,
          updatedAt: Date.now(),
        },
      },
    },
    createdAt: new Date().toISOString(),
  });

  const strip = page.getByTestId("composer-mode-strip");
  await expect(strip.getByText(/持续 \*\*重构\*\* 输入框状态/).first()).toBeVisible();
  await expect(strip.getByText(/256 tokens/).first()).toBeVisible();
  const goalMessages = page.locator(".thread-user-message", { hasText: "/goal 持续" });
  await expect(goalMessages).toHaveCount(1);
  await expect(goalMessages.first().locator("strong").getByText("重构")).toBeVisible();
  await page.getByTestId("composer-goal-summary").click();
  const goalDialog = page.getByRole("dialog");
  await expect(goalDialog.getByText("目标详情")).toBeVisible();
  await expect(goalDialog.locator(".markdown-content strong").getByText("重构")).toBeVisible();
  await expect(goalDialog.getByText("保持滚动稳定")).toBeVisible();
  await expect(page.getByTestId("chat-scroll-area").getByText("目标已更新")).toHaveCount(0);

  await applyGatewayLiveEvent(page, {
    id: 303,
    hostId: 1,
    threadId,
    method: "thread/goal/updated",
    payload: {
      params: {
        threadId,
        turnId: "turn-goal-progress",
        goal: {
          threadId,
          objective: "持续重构输入框状态",
          status: "complete",
          tokenBudget: null,
          tokensUsed: 512,
          timeUsedSeconds: 8,
          createdAt: Date.now() - 8000,
          updatedAt: Date.now(),
        },
      },
    },
    createdAt: new Date().toISOString(),
  });

  await expect(page.getByTestId("composer-mode-strip")).toHaveCount(0);
  await expect(page.getByTestId("chat-scroll-area").getByText("目标已更新")).toHaveCount(0);
  await expect(goalMessages).toHaveCount(1);
});

test("plan mode shows implementation actions for a second completed turn plan", async ({
  page,
}) => {
  await openApp(page);
  await seedGatewayThread(page, {
    threadId: "e2e-repeat-plan-thread",
    currentThread: { id: "e2e-repeat-plan-thread", name: "Repeat Plan" },
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
  await page.getByRole("button", { name: "退出计划模式" }).click();
  await expect(page.getByText("计划模式")).toBeHidden();
});
