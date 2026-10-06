import "@open-file-viewer/core/style.css";
// Keep this as a Vite URL import instead of copying the worker into this package. Vite library
// mode either inlines assets or emits a package-relative URL that the consuming Nuxt build does
// not collect reliably. Externalizing this one import lets the final application build hash,
// publish, and rebase the worker together with its deployment base URL. That avoids a hardcoded
// public path/resource manifest while the app still imports only this package's semantic entry.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import pdfLegacyWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// Viewer 0.1.46+ chooses the PDF.js engine by browser capabilities. Supply both workers from
// the same PDF.js release so its official legacy engine works on older mobile browsers too.
export { pdfWorkerUrl, pdfLegacyWorkerUrl };

export {
  createViewer,
  fallbackPlugin,
  imagePlugin,
  officePlugin,
  pdfPlugin,
} from "@open-file-viewer/core";

export type {
  FileViewer,
  PreviewLocale,
  PreviewSource,
  PreviewTheme,
  PreviewToolbarOptions,
} from "@open-file-viewer/core";
