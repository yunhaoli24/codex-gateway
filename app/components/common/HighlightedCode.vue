<script setup lang="ts">
import { computed } from "vue";
import { useCodeHighlighter } from "@/composables/files/useCodeHighlighter";

const props = withDefaults(
  defineProps<{
    code: string;
    language?: string;
    preClass?: string;
    streaming?: boolean;
  }>(),
  {
    language: "",
    preClass: "",
    streaming: false,
  },
);

const codeRef = computed(() => props.code);
const languageRef = computed(() => props.language);
const streamingRef = computed(() => props.streaming);
const { html } = useCodeHighlighter(codeRef, languageRef, streamingRef);
</script>

<template>
  <pre :class="preClass" v-html="html" />
</template>
