import { getRequestURL } from "h3";
import { gatewayRequestLogContext, logGatewayApiError } from "../utils/gateway/http/errors";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("error", (error, { event }) => {
    if (!event) {
      return;
    }
    const url = getRequestURL(event);
    const context = gatewayRequestLogContext(event);
    logGatewayApiError(
      context?.scope ?? "request",
      {
        method: event.method,
        path: url.pathname,
        query: url.search || null,
        ...context?.details,
      },
      error,
    );
  });
});
