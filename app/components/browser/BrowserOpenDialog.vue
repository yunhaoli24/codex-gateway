<script setup lang="ts">
import { GlobeIcon } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const props = defineProps<{ open: boolean; openTarget: (targetUrl: string) => void }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const targetUrl = ref("http://localhost:3000");

function submit() {
  const value = targetUrl.value.trim();
  if (!value) return;
  props.openTarget(value);
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <GlobeIcon class="size-4" />{{ $t("app.openBrowser") }}
        </DialogTitle>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="submit">
        <Input
          v-model="targetUrl"
          autofocus
          spellcheck="false"
          placeholder="http://localhost:3000"
        />
        <p class="text-sm text-ink-muted">{{ $t("app.browserTargetHint") }}</p>
        <DialogFooter>
          <span @click="submit">
            <Button data-testid="browser-open-submit" type="button">{{ $t("app.open") }}</Button>
          </span>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
