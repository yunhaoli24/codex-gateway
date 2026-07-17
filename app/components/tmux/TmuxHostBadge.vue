<script setup lang="ts">
import ColorHash from "color-hash";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";

const props = defineProps<{
  hostId: number;
  name: string;
}>();

const colorHash = new ColorHash();
const color = computed(() => colorHash.hex(String(props.hostId)));
const badgeStyle = computed(() => ({
  borderColor: `color-mix(in srgb, ${color.value} 45%, transparent)`,
  backgroundColor: `color-mix(in srgb, ${color.value} 14%, transparent)`,
  color: `color-mix(in srgb, ${color.value} 72%, currentColor)`,
}));
</script>

<template>
  <Badge variant="outline" class="max-w-full gap-1.5" :style="badgeStyle">
    <span class="size-1.5 shrink-0 rounded-full bg-current" />
    <span class="truncate" :title="name">{{ name }}</span>
  </Badge>
</template>
