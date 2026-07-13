<script setup lang="ts">
import type { FilePreviewDocument } from "~~/shared/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

defineProps<{ document: FilePreviewDocument | null }>();
const emit = defineEmits<{ cancel: []; discard: []; save: [] }>();
</script>

<template>
  <AlertDialog :open="Boolean(document)" @update:open="(open) => !open && emit('cancel')">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ $t("app.closeUnsavedFileTitle") }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t("app.closeUnsavedFileDescription", { name: document?.title ?? "" }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="emit('cancel')">{{ $t("app.cancel") }}</AlertDialogCancel>
        <Button variant="destructive" @click="emit('discard')">{{ $t("app.discard") }}</Button>
        <Button @click="emit('save')">{{ $t("app.saveFile") }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
