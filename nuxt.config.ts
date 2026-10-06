// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  sourcemap: {
    client: false,
    server: false,
  },
  experimental: {
    // Nuxt 4.6 owns the route type tree (fetchdts), avoiding Nitro's deep InternalApi unions.
    // Keep unknown API paths as type errors so a renamed endpoint fails lint before the E2E run.
    routeTypedFetch: true,
    strictRouteTypes: true,
    checkOutdatedBuildInterval: 5 * 60_000,
    emitRouteChunkError: "automatic-immediate",
    // Nuxt 4.5 reuses Vite's watcher instead of opening a second watcher tree.
    watcher: "builder",
  },
  css: ["~/assets/css/tailwind.css"],
  modules: ["@pinia/nuxt", "@nuxtjs/device", "@nuxtjs/i18n", "nuxt-echarts"],
  echarts: {
    renderer: "canvas",
    charts: ["LineChart"],
    components: ["GridComponent", "TooltipComponent", "LegendComponent"],
  },
  vite: {
    resolve: {
      // Open File Viewer loads Prism languages in dependency order. One shared Prism instance
      // preserves that side-effect ordering without forcing all languages into a vendor chunk.
      dedupe: ["prismjs"],
    },
    plugins: [tailwindcss()],
  },
  nitro: {
    rollupConfig: {
      external: ["node:sqlite"],
    },
    experimental: {
      websocket: true,
      tasks: true,
    },
    scheduledTasks: {
      "*/30 * * * * *": ["gateway:sync-running-threads"],
      "*/5 * * * *": ["gateway:poll-tmux-monitors"],
      "0 * * * *": ["gateway:prune-expired-sessions"],
    },
  },
  i18n: {
    defaultLocale: "zh",
    strategy: "no_prefix",
    detectBrowserLanguage: false,
    locales: [
      { code: "zh", name: "中文", file: "zh.json" },
      { code: "en", name: "English", file: "en.json" },
    ],
  },
});
