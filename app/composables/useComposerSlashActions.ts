import type { Ref } from "vue";
import type { SlashCommand } from "@/composables/useSlashCommands";
import { useGatewayStore } from "@/stores/gateway";

type ComposerSlashCommand = Extract<SlashCommand["id"], "new" | "plan" | "goal">;
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
    (command: SlashCommand) => Promise<void> | void
  > = {
    new: (command) => runCommand(command.id, ""),
    plan: (command) => runCommand(command.id, ""),
    goal: (command) => {
      input.text.value = `${command.command} `;
    },
  };

  async function runSlashCommand(command: SlashCommand) {
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
