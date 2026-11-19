<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@codex-gateway/ui/utils";
import LoaderIcon from "./LoaderIcon.vue";
import { useUiMessages } from "@codex-gateway/ui/i18n";

const messages = useUiMessages();

interface Props {
  size?: number;
  class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<Props>(), {
  size: 16,
});
</script>

<template>
  <div
    :class="cn('inline-flex animate-spin items-center justify-center', props.class)"
    :aria-label="messages.loading"
    aria-live="polite"
    role="status"
    v-bind="$attrs"
  >
    <LoaderIcon :size="props.size" />
  </div>
</template>
