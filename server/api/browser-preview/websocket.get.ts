import {
  closeBrowserPreviewWebSocket,
  forwardBrowserPreviewWebSocketMessage,
  openBrowserPreviewWebSocket,
} from "../../utils/gateway/browser-preview/browser-preview-websocket";

export default defineWebSocketHandler({
  open: openBrowserPreviewWebSocket,
  message: forwardBrowserPreviewWebSocketMessage,
  close: closeBrowserPreviewWebSocket,
  error: closeBrowserPreviewWebSocket,
});
