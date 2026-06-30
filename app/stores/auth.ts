import { defineStore } from "pinia";

export const AUTH_STORAGE_KEY = "codex-gateway-auth-token";

export const useAuthStore = defineStore("auth", () => {
  const token = ref("");
  const username = ref("");
  const initialized = ref(false);

  const isAuthenticated = computed(() => Boolean(token.value));

  function hydrate() {
    if (!import.meta.client || initialized.value) {
      return;
    }
    token.value = localStorage.getItem(AUTH_STORAGE_KEY) || "";
    username.value = localStorage.getItem(`${AUTH_STORAGE_KEY}:username`) || "";
    initialized.value = true;
  }

  async function login(input: { username: string; password: string }) {
    const session = await $fetch<{
      token: string;
      expiresAt: string;
      user: { id: number; username: string };
    }>("/api/auth/login", {
      method: "POST",
      body: input,
    });
    setSession(session.token, session.user.username);
    return session;
  }

  function setSession(nextToken: string, nextUsername: string) {
    token.value = nextToken;
    username.value = nextUsername;
    initialized.value = true;
    if (import.meta.client) {
      localStorage.setItem(AUTH_STORAGE_KEY, nextToken);
      localStorage.setItem(`${AUTH_STORAGE_KEY}:username`, nextUsername);
    }
  }

  function logout() {
    token.value = "";
    username.value = "";
    initialized.value = true;
    if (import.meta.client) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(`${AUTH_STORAGE_KEY}:username`);
    }
  }

  return {
    token,
    username,
    initialized,
    isAuthenticated,
    hydrate,
    login,
    logout,
  };
});
