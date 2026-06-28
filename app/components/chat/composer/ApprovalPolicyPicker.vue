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
        class="h-10 shrink-0 gap-2 px-2 text-sm font-normal text-[#858b91] hover:bg-black/[0.04] hover:text-[#4f575e] md:text-base"
      >
        <SettingsIcon class="size-5" />
        <span>{{ t(`app.${activeApprovalOption.shortLabelKey}`) }}</span>
        <ChevronDownIcon class="size-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      class="w-[min(92vw,theme(maxWidth.xl))] gap-1 rounded-2xl p-2 shadow-xl shadow-slate-900/15"
    >
      <div class="flex items-center gap-4 px-3 py-2 text-base text-[#858b91]">
        <span>{{ t("app.approvalQuestion") }}</span>
        <button type="button" class="underline underline-offset-4 hover:text-[#202225]">
          {{ t("app.learnMore") }}
        </button>
      </div>
      <button
        v-for="option in approvalOptions"
        :key="option.value"
        type="button"
        class="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-xl px-3 py-2.5 text-left hover:bg-black/[0.04]"
        :class="option.value === modelValue ? 'bg-black/[0.04]' : ''"
        @click="emit('update:modelValue', option.value)"
      >
        <component :is="option.icon" class="size-5 text-[#5f6970]" />
        <span class="min-w-0">
          <span class="block text-lg leading-6 text-[#202225]">{{
            t(`app.${option.labelKey}`)
          }}</span>
          <span class="block truncate text-base leading-6 text-[#858b91]">{{
            t(`app.${option.descriptionKey}`)
          }}</span>
        </span>
        <CheckIcon v-if="option.value === modelValue" class="size-5 text-[#202225]" />
      </button>
    </PopoverContent>
  </Popover>
</template>
