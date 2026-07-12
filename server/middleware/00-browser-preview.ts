import { getRequestHost } from "h3";
import { isBrowserPreviewHostname } from "../utils/gateway/browser-preview/browser-preview-manager";
import { handleBrowserPreviewRequest } from "../utils/gateway/browser-preview/browser-preview-proxy";

export default defineEventHandler(async (event) => {
  const hostname = getRequestHost(event, { xForwardedHost: false }).split(":", 1)[0]!.toLowerCase();
  if (!isBrowserPreviewHostname(hostname)) return;
  await handleBrowserPreviewRequest(event.node.req, event.node.res);
});
