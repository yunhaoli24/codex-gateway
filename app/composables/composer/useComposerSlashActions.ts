import type { Ref } from "vue";
import { z } from "zod";
import type { SlashMenuItem } from "./useSlashCommands";
import type { useComposerGoalControls } from "./useComposerGoalControls";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { useGatewayComposerStore } from "@/stores/gateway-composer";

type ComposerSlashCommand = Extract<SlashMenuItem["id"], "new" | "plan" | "goal" | "provider">;
type GoalMenuCommand = Extract<
  SlashMenuItem["id"],
  "goal-objective" | "goal-edit" | "goal-pause" | "goal-resume" | "goal-clear"
>;
type SlashCommandAction = (args: string) => Promise<void> | void;
type GoalControlAction = () => Promise<void>;
type ComposerGoalControls = ReturnType<typeof useComposerGoalControls>;

export function useComposerSlashActions(input: {
  text: Ref<string>;
  selectedThreadId: Ref<string | null>;
  startNewThread: () => Promise<void>;
  activatePlanMode: () => Promise<void>;
  openModelProviders: () => void;
  missingGoalObjectiveMessage: Ref<string>;
  goalControls: ComposerGoalControls;
}) {
  const gateway = useGatewayBootstrapStore();
  const composer = useGatewayComposerStore();

  const slashCommandActions: Record<ComposerSlashCommand, SlashCommandAction> = {
    new: async () => {
      input.text.value = "";
      await input.startNewThread();
    },
    plan: input.activatePlanMode,
    provider: () => {
      input.text.value = "";
      input.openModelProviders();
    },
    goal: runGoalCommand,
  };

  const goalControlActions: Record<string, GoalControlAction> = {
    clear: input.goalControls.clear,
    pause: input.goalControls.pause,
    resume: input.goalControls.resume,
  };

  const selectedCommandMenuActions: Record<
    ComposerSlashCommand,
    (command: SlashMenuItem) => Promise<void> | void
  > = {
    new: () => runCommand("new", ""),
    plan: () => runCommand("plan", ""),
    provider: () => runCommand("provider", ""),
    goal: (command) => {
      input.text.value = `${command.command} `;
    },
  };
  const selectedGoalMenuActions: Record<GoalMenuCommand, (command: SlashMenuItem) => void> = {
    "goal-objective": () => {
      input.text.value = "/goal ";
    },
    "goal-edit": () => input.goalControls.editInComposer(),
    "goal-pause": () => {
      void runGoalCommand("pause");
    },
    "goal-resume": () => {
      void runGoalCommand("resume");
    },
    "goal-clear": () => {
      void runGoalCommand("clear");
    },
  };

  async function runSlashCommand(command: SlashMenuItem) {
    if (isGoalMenuCommand(command.id)) {
      selectedGoalMenuActions[command.id](command);
      return;
    }
    await selectedCommandMenuActions[command.id](command);
  }

  async function executeInlineSlashCommand() {
    const parsed = parseSlashCommand(input.text.value);
    if (!parsed) {
      return false;
    }
    await runCommand(parsed.id, parsed.args);
    return true;
  }

  async function runCommand(command: ComposerSlashCommand, args: string) {
    await slashCommandActions[command](args);
  }

  async function runGoalCommand(args: string) {
    if (input.selectedThreadId.value === null) {
      return;
    }
    const control = args.trim().toLowerCase();
    if (control === "") {
      gateway.setError(input.missingGoalObjectiveMessage.value);
      return;
    }
    input.text.value = "";
    gateway.clearError();
    if (control === "edit") {
      input.goalControls.editInComposer();
      return;
    }
    const controlAction = goalControlActions[control];
    if (controlAction) {
      await controlAction();
      return;
    }
    await composer.setSelectedThreadGoal(args.trim());
  }

  return {
    runSlashCommand,
    executeInlineSlashCommand,
  };
}

function isGoalMenuCommand(id: SlashMenuItem["id"]): id is GoalMenuCommand {
  return (
    id === "goal-objective" ||
    id === "goal-edit" ||
    id === "goal-pause" ||
    id === "goal-resume" ||
    id === "goal-clear"
  );
}

function parseSlashCommand(text: string): { id: ComposerSlashCommand; args: string } | null {
  const match = text.trim().match(/^\/(new|plan|goal|provider)(?:\s+([\s\S]*))?$/i);
  if (match === null || match[1] === undefined) {
    return null;
  }
  return {
    id: z.enum(["new", "plan", "goal", "provider"]).parse(match[1].toLowerCase()),
    args: match[2] ?? "",
  };
}
