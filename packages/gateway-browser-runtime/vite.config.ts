import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        "markdown-editor": resolve(import.meta.dirname, "src/markdown-editor/index.ts"),
        markdown: resolve(import.meta.dirname, "src/markdown/index.ts"),
        "open-file-viewer": resolve(import.meta.dirname, "src/open-file-viewer/index.ts"),
      },
      formats: ["es"],
    },
    outDir: "dist",
    rolldownOptions: {
      // Nuxt owns CSS extraction and URL rebasing for the final application. Vite library mode
      // always inlines ordinary assets regardless of assetsInlineLimit; prebuilding these imports
      // made KaTeX CSS 1.46 MB and produced a PDF worker URL that was absent from Nuxt's output.
      // Preserve only standard CSS/URL imports so Nuxt can build their deployment URLs. Do not
      // replace this with copied public files or a package-specific path manifest.
      external: (id) => id.endsWith(".css") || id.endsWith("?url"),
      output: {
        chunkFileNames: "chunks/[name]-[hash].js",
        entryFileNames: "[name]/index.js",
      },
    },
  },
});
