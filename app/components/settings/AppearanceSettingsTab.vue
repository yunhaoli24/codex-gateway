<script setup lang="ts">
import LanguageSwitcher from "@/components/common/LanguageSwitcher.vue";
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
  </div>
</template>
