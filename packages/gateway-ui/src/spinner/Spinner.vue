<script setup lang="ts">
import { Loader2Icon } from "@lucide/vue";

import type { HTMLAttributes } from "vue";
import { cn } from "../utils";
import { useUiMessages } from "../i18n";

const messages = useUiMessages();

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <Loader2Icon
    role="status"
    :aria-label="messages.loading"
    :class="cn('size-4 animate-spin', props.class)"
  />
</template>
