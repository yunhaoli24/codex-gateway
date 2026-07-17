<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

defineProps<{
  open: boolean;
  sessionName: string;
  pending: boolean;
  promote: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <AlertDialog :open="open" @update:open="(value) => !value && emit('cancel')">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ $t("app.tmuxPermanentMonitorConfirmTitle") }}</AlertDialogTitle>
        <AlertDialogDescription class="space-y-3">
          <span class="block">
            {{ $t("app.tmuxPermanentMonitorConfirmDescription", { session: sessionName }) }}
          </span>
          <span class="block rounded-md bg-canvas-soft p-3 text-sm text-ink-secondary">
            {{ $t("app.tmuxPermanentMonitorConsequences") }}
          </span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="pending" @click="emit('cancel')">
          {{ $t("app.cancel") }}
        </AlertDialogCancel>
        <AlertDialogAction :disabled="pending" @click.capture="emit('confirm')">
          {{
            promote ? $t("app.tmuxConfirmPromotePermanent") : $t("app.tmuxConfirmPermanentMonitor")
          }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
