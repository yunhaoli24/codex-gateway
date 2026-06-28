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
        class="min-w-0 flex-1 gap-2 px-2 text-sm font-normal text-[#4f575e] hover:bg-black/[0.04] sm:flex-none md:text-base"
        data-testid="model-select"
        :disabled="loadingModels || !models.length"
      >
        <span class="truncate text-[#202225]">{{
          loadingModels ? t("app.loadingModels") : activeModelLabel
        }}</span>
        <span v-if="activeEffortCompactLabel" class="hidden shrink-0 text-[#858b91] sm:inline">{{
          activeEffortCompactLabel
        }}</span>
        <ChevronDownIcon class="size-4 text-[#858b91]" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="w-[min(92vw,theme(maxWidth.sm))] rounded-2xl p-2 shadow-xl shadow-slate-900/15"
    >
      <DropdownMenuLabel class="px-3 pb-2 pt-1 text-lg font-normal leading-7 text-[#858b91]">
        {{ t("app.reasoningEffort") }}
      </DropdownMenuLabel>
      <DropdownMenuItem
        v-for="option in effortOptions"
        :key="option.value"
        class="min-h-12 rounded-xl px-3 text-base leading-none text-[#202225] focus:bg-black/[0.04]"
        @select="emit('selectEffort', option.value)"
      >
        <span>{{ labelEffortOption(option) }}</span>
        <CheckIcon
          v-if="option.value === activeEffortValue"
          class="ml-auto size-5 text-[#5f6970]"
        />
      </DropdownMenuItem>
      <DropdownMenuSeparator class="mx-3 my-2" />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          data-testid="model-submenu-trigger"
          class="min-h-12 rounded-xl px-3 text-base leading-none text-[#202225] data-open:bg-black/[0.04] focus:bg-black/[0.04] [&>svg]:size-5 [&>svg]:text-[#858b91]"
        >
          <span>{{ activeModelLabel }}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          class="w-[min(92vw,theme(maxWidth.sm))] rounded-2xl p-2 shadow-xl shadow-slate-900/15"
        >
          <DropdownMenuLabel class="px-3 pb-2 pt-1 text-lg font-normal leading-7 text-[#858b91]">
            {{ t("app.model") }}
          </DropdownMenuLabel>
          <DropdownMenuItem
            v-for="modelOption in models"
            :key="modelOption.id"
            :data-testid="`model-option-${modelOptionValue(modelOption)}`"
            class="min-h-12 rounded-xl px-3 text-base leading-none text-[#202225] focus:bg-black/[0.04]"
            @select="emit('selectModel', modelOptionValue(modelOption))"
          >
            <span class="truncate">{{
              modelOption.displayName || modelOption.model || modelOption.id
            }}</span>
            <CheckIcon
              v-if="modelOptionValue(modelOption) === activeModel"
              class="ml-auto size-5 text-[#5f6970]"
            />
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
