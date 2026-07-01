<script setup lang="ts">
import CodeEditor from "@/components/common/CodeEditor.vue";

defineProps<{
  placeholder?: string;
}>();

const model = defineModel<string>({ default: "" });
</script>

<template>
  <CodeEditor
    v-model="model"
    language="json"
    test-id="config-json-editor"
    :placeholder="placeholder"
  />
</template>
