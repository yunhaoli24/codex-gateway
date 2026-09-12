<script setup lang="ts">
import { LoaderCircleIcon, ShieldAlertIcon } from "@lucide/vue";
import { Button } from "@codex-gateway/ui/button";
import { computed } from "vue";

const props = defineProps<{
  hostId: number;
  connecting?: boolean;
}>();

const emit = defineEmits<{
  click: [hostId: number];
}>();

function handleClick() {
  emit("click", props.hostId);
}

const icon = computed(() => (props.connecting ? LoaderCircleIcon : ShieldAlertIcon));
</script>

<template>
  <Button
    :data-testid="`host-mfa-button-${props.hostId}`"
    variant="ghost"
    size="icon"
    class="size-5 shrink-0 rounded-full p-0 text-accent-orange hover:bg-accent-orange/10"
    :title="$t(props.connecting ? 'app.hostMfaConnecting' : 'app.hostMfaRequired')"
    :aria-label="$t(props.connecting ? 'app.hostMfaConnecting' : 'app.hostMfaRequired')"
    @click.stop="handleClick"
  >
    <component :is="icon" class="size-3.5" :class="{ 'animate-spin': props.connecting }" />
  </Button>
</template>
