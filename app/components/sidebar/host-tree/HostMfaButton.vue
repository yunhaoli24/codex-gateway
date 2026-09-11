<script setup lang="ts">
import { ShieldAlertIcon } from "@lucide/vue";
import { Button } from "@codex-gateway/ui/button";

const { hostId } = defineProps<{
  hostId: number;
}>();

const emit = defineEmits<{
  click: [hostId: number];
}>();

function handleClick() {
  emit("click", hostId);
}
</script>

<template>
  <Button
    :data-testid="`host-mfa-button-${hostId}`"
    variant="ghost"
    size="icon"
    class="size-5 shrink-0 rounded-full p-0 text-accent-orange hover:bg-accent-orange/10"
    :title="$t('app.hostMfaRequired')"
    :aria-label="$t('app.hostMfaRequired')"
    @click.stop="handleClick"
  >
    <ShieldAlertIcon class="size-3.5" />
  </Button>
</template>
