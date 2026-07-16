<script setup lang="ts">
import { computed } from "vue";
import { useCodeHighlighter } from "@/composables/files/useCodeHighlighter";

const props = withDefaults(
  defineProps<{
    code: string;
    language?: string;
    preClass?: string;
  }>(),
  {
    language: "",
    preClass: "",
  },
);

const codeRef = computed(() => props.code);
const languageRef = computed(() => props.language);
const { html } = useCodeHighlighter(codeRef, languageRef);
</script>

<template>
  <pre :class="preClass" v-html="html" />
</template>
