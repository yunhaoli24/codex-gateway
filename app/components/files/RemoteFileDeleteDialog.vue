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
  path: string | null;
  deleting: boolean;
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
        <AlertDialogTitle>{{ $t("app.deleteFileTitle") }}</AlertDialogTitle>
        <AlertDialogDescription class="space-y-2">
          <span class="block">{{ $t("app.deleteFileDescription") }}</span>
          <code
            class="block max-h-28 overflow-auto break-all rounded-md bg-canvas-soft p-3 text-xs"
          >
            {{ path }}
          </code>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="deleting" @click="emit('cancel')">
          {{ $t("app.cancelFileDelete") }}
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          :disabled="deleting"
          @click.capture="emit('confirm')"
        >
          {{ $t("app.confirmDeleteFile") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
