// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { gatewayLocales } from "./shared/locales";

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
  modules: ["@pinia/nuxt", "@nuxtjs/device", "@nuxtjs/i18n", "nuxt-echarts", "@vite-pwa/nuxt"],
  pwa: {
    strategies: "injectManifest",
    // Nuxt 4 roots relative PWA paths under app/. Keep the worker outside that DOM TS project
    // and resolve from this config so the production build and E2E layer use the same entry.
    srcDir: fileURLToPath(new URL("./service-worker", import.meta.url)),
    filename: "notifications.ts",
    // The Nuxt module owns registration, updates, and the manifest. Business stores only manage
    // notification permission and account subscriptions through its native runtime hooks.
    manifest: {
      name: "Codex Gateway",
      short_name: "Codex",
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#ffffff",
      icons: [
        { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    // This worker owns push only. Never precache authenticated pages, API replies, or Nuxt
    // bundles: that would introduce another stale-history/cache path alongside the live Gateway.
    injectManifest: { injectionPoint: undefined, globPatterns: [] },
  },
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
    locales: gatewayLocales.map((locale) => ({ ...locale })),
  },
});
