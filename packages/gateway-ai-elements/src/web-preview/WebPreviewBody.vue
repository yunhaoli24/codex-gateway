<script setup lang="ts">
import type { IframeHTMLAttributes, VNodeChild } from "vue";
import { cn } from "@codex-gateway/ui/utils";
import { computed } from "vue";
import { useWebPreviewContext } from "./context";
import { useUiMessages } from "@codex-gateway/ui/i18n";

const messages = useUiMessages();

interface Props extends /* @vue-ignore */ IframeHTMLAttributes {
  class?: IframeHTMLAttributes["class"];
  src?: string;
}

const props = defineProps<Props>();

defineSlots<{
  loading: () => VNodeChild;
}>();

const { url } = useWebPreviewContext();

const frameSrc = computed(() => (props.src ?? url.value) || undefined);
</script>

<template>
  <div class="min-h-0 flex-1">
    <iframe
      :class="cn('block size-full border-0', props.class)"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
      :src="frameSrc"
      :title="messages.preview"
      v-bind="$attrs"
    />
    <slot name="loading" />
  </div>
</template>
