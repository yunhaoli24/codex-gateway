import type { ComputedRef, Ref } from "vue";
import { computed } from "vue";
import type { ThreadGoal } from "~~/shared/types";
import { type SlashMenuItem, useSlashCommands } from "./useSlashCommands";
import { goalSlashActions, type GoalSlashActionId } from "@/utils/composer-goal-slash-actions";

export function useComposerSlashMenu(input: {
  text: Ref<string>;
  selectedThreadId: Ref<string | null>;
  selectedThreadGoal: ComputedRef<ThreadGoal | null>;
  enabled: ComputedRef<boolean>;
  onSelect: (command: SlashMenuItem) => Promise<void>;
}) {
  const { t } = useI18n();
  const rootCommands = computed<SlashMenuItem[]>(() => [
    {
      id: "new",
      command: t("app.slashCommandNew"),
      title: t("app.slashCommandNewTitle"),
      description: t("app.slashCommandNewDescription"),
    },
    ...(input.selectedThreadId.value
      ? [
          {
            id: "plan" as const,
            command: t("app.slashCommandPlan"),
            title: t("app.slashCommandPlanTitle"),
            description: t("app.slashCommandPlanDescription"),
          },
          {
            id: "goal" as const,
            command: t("app.slashCommandGoal"),
            title: t("app.slashCommandGoalTitle"),
            description: t("app.slashCommandGoalDescription"),
          },
        ]
      : []),
  ]);
  const menuItems = computed<SlashMenuItem[]>(() => {
    if (isGoalSlashInput(input.text.value) && input.selectedThreadId.value) {
      return goalSlashActions({
        goal: input.selectedThreadGoal.value,
        commandPrefix: t("app.slashCommandGoal"),
        labels: goalSlashActionLabels(t),
      });
    }
    return rootCommands.value;
  });
  const state = useSlashCommands({
    text: input.text,
    commands: menuItems,
    enabled: input.enabled,
    onSelect: async (command) => {
      await input.onSelect(command);
      state.dismiss();
    },
  });

  return state;
}

function isGoalSlashInput(text: string) {
  return /^\/goal(?:\s|$)/.test(text.trimStart().toLowerCase());
}

function goalSlashActionLabels(
  t: ReturnType<typeof useI18n>["t"],
): Record<GoalSlashActionId, { title: string; description: string }> {
  return {
    "goal-objective": {
      title: t("app.slashGoalSetTitle"),
      description: t("app.slashGoalSetDescription"),
    },
    "goal-edit": {
      title: t("app.slashGoalEditTitle"),
      description: t("app.slashGoalEditDescription"),
    },
    "goal-pause": {
      title: t("app.slashGoalPauseTitle"),
      description: t("app.slashGoalPauseDescription"),
    },
    "goal-resume": {
      title: t("app.slashGoalResumeTitle"),
      description: t("app.slashGoalResumeDescription"),
    },
    "goal-clear": {
      title: t("app.slashGoalClearTitle"),
      description: t("app.slashGoalClearDescription"),
    },
  };
}
