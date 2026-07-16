<script setup lang="ts">
import { LogOutIcon } from "@lucide/vue";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.vue";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";

const emit = defineEmits<{ close: [] }>();
const auth = useAuthStore();
const loggingOut = ref(false);

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await auth.logout();
    emit("close");
  } finally {
    loggingOut.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-5">
    <div class="space-y-1">
      <div class="font-medium">{{ $t("app.appearanceSettings") }}</div>
      <p class="text-sm text-ink-secondary">
        {{ $t("app.appearanceSettingsDescription") }}
      </p>
    </div>

    <div class="rounded-xl border border-hairline bg-canvas-soft/70 p-4">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <div class="text-sm font-medium">{{ $t("app.interfaceLanguage") }}</div>
          <p class="text-sm text-ink-secondary">
            {{ $t("app.interfaceLanguageDescription") }}
          </p>
        </div>
        <LanguageSwitcher />
      </div>
    </div>

    <div class="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <div class="space-y-1">
        <div class="text-sm font-medium">{{ $t("app.accountSession") }}</div>
        <p class="text-sm text-ink-secondary">
          {{ $t("app.logoutDescription") }}
        </p>
      </div>
      <Button variant="destructive" :disabled="loggingOut" @click="logout">
        <LogOutIcon class="size-4" />
        {{ loggingOut ? $t("app.loggingOut") : $t("app.logout") }}
      </Button>
    </div>
  </div>
</template>
