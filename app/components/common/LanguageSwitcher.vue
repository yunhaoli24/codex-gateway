<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@codex-gateway/ui/select";
import { gatewayLocales, isGatewayLocale } from "~~/shared/locales";

const { locale, setLocale } = useI18n();

async function switchLanguage(value: unknown) {
  if (isGatewayLocale(value)) {
    await setLocale(value);
  }
}
</script>

<template>
  <Select :model-value="locale" @update:model-value="switchLanguage">
    <SelectTrigger class="h-8 w-28 bg-surface/80">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="language in gatewayLocales" :key="language.code" :value="language.code">
        {{ language.name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
