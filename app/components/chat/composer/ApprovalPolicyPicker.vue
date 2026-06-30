<script setup lang="ts">
import {
  CheckIcon,
  ChevronDownIcon,
  HandIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "@lucide/vue";
import { computed } from "vue";
import type { ApprovalPolicy } from "~~/shared/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const props = defineProps<{
  modelValue: ApprovalPolicy | "custom";
}>();

const emit = defineEmits<{
  "update:modelValue": [value: ApprovalPolicy | "custom"];
}>();

const { t } = useI18n();
const approvalOptions: Array<{
  value: ApprovalPolicy | "custom";
  icon: any;
  labelKey: string;
  shortLabelKey: string;
  descriptionKey: string;
}> = [
  {
    value: "untrusted",
    icon: HandIcon,
    labelKey: "approvalAsk",
    shortLabelKey: "approvalAskShort",
    descriptionKey: "approvalAskDescription",
  },
  {
    value: "on-request",
    icon: ShieldCheckIcon,
    labelKey: "approvalAuto",
    shortLabelKey: "approvalAutoShort",
    descriptionKey: "approvalAutoDescription",
  },
  {
    value: "never",
    icon: ShieldAlertIcon,
    labelKey: "approvalFullAccess",
    shortLabelKey: "approvalFullAccessShort",
    descriptionKey: "approvalFullAccessDescription",
  },
  {
    value: "custom",
    icon: SettingsIcon,
    labelKey: "approvalCustom",
    shortLabelKey: "approvalCustomShort",
    descriptionKey: "approvalCustomDescription",
  },
];
const activeApprovalOption = computed(
  () =>
    approvalOptions.find((option) => option.value === props.modelValue) ?? approvalOptions.at(-1)!,
);
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="lg"
        class="h-10 shrink-0 gap-1.5 px-1.5 text-sm font-normal text-ink-muted hover:bg-canvas-soft hover:text-ink-secondary sm:gap-2 sm:px-2 md:text-base"
      >
        <SettingsIcon class="size-5" />
        <span class="max-w-[4.5rem] truncate sm:max-w-none">{{
          t(`app.${activeApprovalOption.shortLabelKey}`)
        }}</span>
        <ChevronDownIcon class="size-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      class="w-[min(92vw,theme(maxWidth.xl))] gap-1 rounded-2xl border-hairline p-2 shadow-xl shadow-ink/10"
    >
      <div class="flex items-center gap-4 px-3 py-2 text-base text-ink-muted">
        <span>{{ t("app.approvalQuestion") }}</span>
        <button
          type="button"
          class="text-primary underline underline-offset-4 hover:text-primary-active"
        >
          {{ t("app.learnMore") }}
        </button>
      </div>
      <button
        v-for="option in approvalOptions"
        :key="option.value"
        type="button"
        class="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-xl px-3 py-2.5 text-left hover:bg-canvas-soft"
        :class="option.value === modelValue ? 'bg-canvas-soft' : ''"
        @click="emit('update:modelValue', option.value)"
      >
        <component :is="option.icon" class="size-5 text-ink-muted" />
        <span class="min-w-0">
          <span class="block text-lg leading-6 text-ink">{{ t(`app.${option.labelKey}`) }}</span>
          <span class="block truncate text-base leading-6 text-ink-muted">{{
            t(`app.${option.descriptionKey}`)
          }}</span>
        </span>
        <CheckIcon v-if="option.value === modelValue" class="size-5 text-primary" />
      </button>
    </PopoverContent>
  </Popover>
</template>
