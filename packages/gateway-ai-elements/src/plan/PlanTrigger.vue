<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ChevronsUpDownIcon } from "@lucide/vue";
import { Button } from "@codex-gateway/ui/button";
import { CollapsibleTrigger } from "@codex-gateway/ui/collapsible";
import { cn } from "@codex-gateway/ui/utils";
import { useUiMessages } from "@codex-gateway/ui/i18n";

const messages = useUiMessages();

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <CollapsibleTrigger as-child>
    <Button :class="cn('size-8', props.class)" data-slot="plan-trigger" size="icon" variant="ghost">
      <ChevronsUpDownIcon class="size-4" />
      <span class="sr-only">{{ messages.togglePlan }}</span>
    </Button>
  </CollapsibleTrigger>
</template>
