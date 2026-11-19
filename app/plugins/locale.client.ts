import { useLocalStorage } from "@vueuse/core";

export default defineNuxtPlugin({
  name: "gateway-locale",
  dependsOn: ["i18n:plugin"],
  async setup(nuxt) {
    const savedLocale = useLocalStorage<string | null>("codex-gateway-locale", null);
    if (savedLocale.value === "zh" || savedLocale.value === "en") {
      await nuxt.$i18n.setLocale(savedLocale.value);
    }

    nuxt.hook("i18n:localeSwitched", ({ newLocale }) => {
      savedLocale.value = newLocale;
    });
  },
});
