import type { ComputedRef, Ref } from "vue";
import { computed, ref, watch } from "vue";

export type SlashCommandId = "new" | "plan";

export interface SlashCommand {
  id: SlashCommandId;
  command: string;
  title: string;
  description: string;
}

export function useSlashCommands(args: {
  text: Ref<string>;
  commands: ComputedRef<SlashCommand[]>;
  enabled: ComputedRef<boolean>;
  onSelect: (command: SlashCommand) => void | Promise<void>;
}) {
  const selectedIndex = ref(0);
  const dismissed = ref(false);

  const query = computed(() => {
    const text = args.text.value.trimStart();
    if (!text.startsWith("/") || /\s/.test(text)) {
      return null;
    }
    return text.slice(1).toLowerCase();
  });

  const filteredCommands = computed(() => {
    if (query.value === null) {
      return [];
    }
    return args.commands.value.filter((command) =>
      command.command.slice(1).startsWith(query.value ?? ""),
    );
  });

  const menuOpen = computed(() =>
    Boolean(
      args.enabled.value &&
      !dismissed.value &&
      query.value !== null &&
      filteredCommands.value.length,
    ),
  );

  watch(args.text, () => {
    dismissed.value = false;
  });

  watch(filteredCommands, (commands) => {
    if (selectedIndex.value >= commands.length) {
      selectedIndex.value = 0;
    }
  });

  function dismiss() {
    dismissed.value = true;
  }

  function resetSelection() {
    selectedIndex.value = 0;
  }

  function selectIndex(index: number) {
    selectedIndex.value = index;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing || !menuOpen.value) {
      return false;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex.value = (selectedIndex.value + 1) % filteredCommands.value.length;
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex.value =
        (selectedIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length;
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const command = filteredCommands.value[selectedIndex.value];
      if (command) {
        void args.onSelect(command);
      }
      return true;
    }
    return false;
  }

  return {
    menuOpen,
    filteredCommands,
    selectedIndex,
    dismiss,
    resetSelection,
    selectIndex,
    handleKeydown,
  };
}
