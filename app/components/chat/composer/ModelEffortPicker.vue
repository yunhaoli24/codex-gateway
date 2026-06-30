<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue";
import type { ModelRecord, ReasoningEffort } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

defineProps<{
  models: ModelRecord[];
  loadingModels: boolean;
  activeModel: string;
  activeModelLabel: string;
  activeEffortValue: string;
  activeEffortCompactLabel: string;
  effortOptions: Array<{ value: ReasoningEffort; label?: string }>;
  labelEffortOption: (option: { value: ReasoningEffort; label?: string } | undefined) => string;
  modelOptionValue: (modelOption: { model?: string; id: string }) => string;
}>();

const emit = defineEmits<{
  selectModel: [model: string];
  selectEffort: [effort: ReasoningEffort];
}>();

const { t } = useI18n();
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="lg"
        class="min-w-0 max-w-full gap-1.5 px-1.5 text-sm font-normal text-ink-secondary hover:bg-canvas-soft sm:gap-2 sm:px-2 md:text-base"
        data-testid="model-select"
        :disabled="loadingModels || !models.length"
      >
        <span class="truncate text-ink">{{
          loadingModels ? t("app.loadingModels") : activeModelLabel
        }}</span>
        <span v-if="activeEffortCompactLabel" class="hidden shrink-0 text-ink-muted sm:inline">{{
          activeEffortCompactLabel
        }}</span>
        <ChevronDownIcon class="size-4 text-ink-muted" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="w-[min(92vw,theme(maxWidth.sm))] rounded-2xl border-hairline p-2 shadow-xl shadow-ink/10"
    >
      <DropdownMenuLabel class="px-3 pb-2 pt-1 text-lg font-normal leading-7 text-ink-muted">
        {{ t("app.reasoningEffort") }}
      </DropdownMenuLabel>
      <DropdownMenuItem
        v-for="option in effortOptions"
        :key="option.value"
        class="min-h-12 rounded-xl px-3 text-base leading-none text-ink focus:bg-canvas-soft"
        @select="emit('selectEffort', option.value)"
      >
        <span>{{ labelEffortOption(option) }}</span>
        <CheckIcon v-if="option.value === activeEffortValue" class="ml-auto size-5 text-primary" />
      </DropdownMenuItem>
      <DropdownMenuSeparator class="mx-3 my-2" />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          data-testid="model-submenu-trigger"
          class="min-h-12 rounded-xl px-3 text-base leading-none text-ink data-open:bg-canvas-soft focus:bg-canvas-soft [&>svg]:size-5 [&>svg]:text-ink-muted"
        >
          <span>{{ activeModelLabel }}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          class="w-[min(92vw,theme(maxWidth.sm))] rounded-2xl border-hairline p-2 shadow-xl shadow-ink/10"
        >
          <DropdownMenuLabel class="px-3 pb-2 pt-1 text-lg font-normal leading-7 text-ink-muted">
            {{ t("app.model") }}
          </DropdownMenuLabel>
          <DropdownMenuItem
            v-for="modelOption in models"
            :key="modelOption.id"
            :data-testid="`model-option-${modelOptionValue(modelOption)}`"
            class="min-h-12 rounded-xl px-3 text-base leading-none text-ink focus:bg-canvas-soft"
            @select="emit('selectModel', modelOptionValue(modelOption))"
          >
            <span class="truncate">{{
              modelOption.displayName || modelOption.model || modelOption.id
            }}</span>
            <CheckIcon
              v-if="modelOptionValue(modelOption) === activeModel"
              class="ml-auto size-5 text-primary"
            />
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
