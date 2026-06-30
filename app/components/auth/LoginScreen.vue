<script setup lang="ts">
import { Loader2Icon } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const { t } = useI18n();
const username = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

async function submit() {
  error.value = "";
  loading.value = true;
  try {
    await auth.login({ username: username.value, password: password.value });
  } catch (caught: any) {
    error.value = caught?.data?.message || caught?.message || t("app.loginFailed");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
    <form
      class="w-full max-w-sm rounded-2xl border border-hairline bg-surface p-6 shadow-xl"
      data-testid="login-form"
      @submit.prevent="submit"
    >
      <div class="space-y-2">
        <h1 class="text-xl font-semibold text-ink">{{ t("app.loginTitle") }}</h1>
        <p class="text-sm leading-6 text-ink-muted">{{ t("app.loginDescription") }}</p>
      </div>
      <div class="mt-6 space-y-3">
        <Input
          v-model="username"
          autocomplete="username"
          :placeholder="t('app.username')"
          data-testid="login-username"
        />
        <Input
          v-model="password"
          type="password"
          autocomplete="current-password"
          :placeholder="t('app.password')"
          data-testid="login-password"
        />
      </div>
      <div
        v-if="error"
        class="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {{ error }}
      </div>
      <Button
        type="submit"
        class="mt-5 w-full gap-2"
        :disabled="loading"
        data-testid="login-submit"
      >
        <Loader2Icon v-if="loading" class="size-4 animate-spin" />
        {{ t("app.login") }}
      </Button>
    </form>
  </main>
</template>
