<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const { locale, setLocale } = useI18n()

async function switchLanguage(value: string | null) {
  if (value === 'zh' || value === 'en') {
    await setLocale(value)
  }
}
</script>

<template>
  <Select :model-value="locale" @update:model-value="switchLanguage">
    <SelectTrigger class="h-8 w-28 bg-white/80">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="zh">中文</SelectItem>
      <SelectItem value="en">English</SelectItem>
    </SelectContent>
  </Select>
</template>
