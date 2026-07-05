import type { Ref } from "vue";
import type { SlashMenuItem } from "@/composables/useSlashCommands";
import { useGatewayStore } from "@/stores/gateway";

type ComposerSlashCommand = Extract<SlashMenuItem["id"], "new" | "plan" | "goal">;
type GoalMenuCommand = Extract<
  SlashMenuItem["id"],
  "goal-objective" | "goal-edit" | "goal-pause" | "goal-resume" | "goal-clear"
>;
type SlashCommandAction = (args: string) => Promise<void> | void;
type GoalControlAction = () => Promise<void>;

export function useComposerSlashActions(input: {
  text: Ref<string>;
  selectedThreadId: Ref<string | null>;
  startNewThread: () => Promise<void>;
  activatePlanMode: () => void;
  missingGoalObjectiveMessage: Ref<string>;
}) {
  const store = useGatewayStore();

  const slashCommandActions: Record<ComposerSlashCommand, SlashCommandAction> = {
    new: async () => {
      input.text.value = "";
      await input.startNewThread();
    },
    plan: () => input.activatePlanMode(),
    goal: runGoalCommand,
  };

  const goalControlActions: Record<string, GoalControlAction> = {
    clear: () => store.clearSelectedThreadGoal(),
    pause: () => store.setSelectedThreadGoalStatus("paused"),
    resume: () => store.setSelectedThreadGoalStatus("active"),
  };

  const selectedCommandMenuActions: Record<
    ComposerSlashCommand,
    (command: SlashMenuItem) => Promise<void> | void
  > = {
    new: () => runCommand("new", ""),
    plan: () => runCommand("plan", ""),
    goal: (command) => {
      input.text.value = `${command.command} `;
    },
  };
  const selectedGoalMenuActions: Record<GoalMenuCommand, (command: SlashMenuItem) => void> = {
    "goal-objective": () => {
      input.text.value = "/goal ";
    },
    "goal-edit": (command) => {
      input.text.value = `${command.command.replace(/\s+edit$/i, "")} ${
        store.selectedThreadGoal?.objective ?? ""
      }`.trimEnd();
    },
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
    if (!input.selectedThreadId.value) {
      return;
    }
    const control = args.trim().toLowerCase();
    if (!control) {
      store.setError(input.missingGoalObjectiveMessage.value);
      return;
    }
    input.text.value = "";
    store.clearError();
    if (control === "edit") {
      input.text.value = `/goal ${store.selectedThreadGoal?.objective ?? ""}`.trimEnd();
      return;
    }
    const controlAction = goalControlActions[control];
    if (controlAction) {
      await controlAction();
      return;
    }
    await store.setSelectedThreadGoal(args.trim());
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
  const match = text.trim().match(/^\/(new|plan|goal)(?:\s+([\s\S]*))?$/i);
  if (!match) {
    return null;
  }
  return {
    id: match[1]!.toLowerCase() as ComposerSlashCommand,
    args: match[2] ?? "",
  };
}
