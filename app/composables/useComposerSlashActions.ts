import type { Ref } from "vue";
import type { SlashCommand } from "@/composables/useSlashCommands";
import { useGatewayStore } from "@/stores/gateway";

type ComposerSlashCommand = Extract<SlashCommand["id"], "new" | "plan" | "goal">;

export function useComposerSlashActions(input: {
  text: Ref<string>;
  selectedThreadId: Ref<string | null>;
  startNewThread: () => Promise<void>;
  activatePlanMode: () => void;
}) {
  const store = useGatewayStore();

  async function runSlashCommand(command: SlashCommand) {
    if (command.id === "new") {
      await runCommand("new", "");
      return;
    }
    if (command.id === "plan") {
      await runCommand("plan", "");
      return;
    }
    await runCommand("goal", "");
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
    if (command === "new") {
      input.text.value = "";
      await input.startNewThread();
      return;
    }
    if (command === "plan") {
      input.activatePlanMode();
      return;
    }
    await runGoalCommand(args);
  }

  async function runGoalCommand(args: string) {
    input.text.value = "";
    if (!input.selectedThreadId.value) {
      return;
    }
    const control = args.trim().toLowerCase();
    if (!control) {
      await store.refreshSelectedThreadGoal();
      return;
    }
    if (control === "clear") {
      await store.clearSelectedThreadGoal();
      return;
    }
    if (control === "pause") {
      await store.setSelectedThreadGoalStatus("paused");
      return;
    }
    if (control === "resume") {
      await store.setSelectedThreadGoalStatus("active");
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
