<script setup lang="ts">
import { PanelLeftIcon } from "@lucide/vue";

import type { HTMLAttributes } from "vue";
import { cn } from "../utils";
import { Button } from "../button";
import { useSidebar } from "./utils";
import { useUiMessages } from "../i18n";

const messages = useUiMessages();

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const { toggleSidebar } = useSidebar();
</script>

<template>
  <Button
    data-sidebar="trigger"
    data-slot="sidebar-trigger"
    variant="ghost"
    size="icon-sm"
    :class="cn('', props.class)"
    @click="toggleSidebar"
  >
    <PanelLeftIcon class="cn-rtl-flip" />
    <span class="sr-only">{{ messages.toggleSidebar }}</span>
  </Button>
</template>
