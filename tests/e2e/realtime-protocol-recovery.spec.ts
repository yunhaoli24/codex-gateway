import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";
import {
  activeRealtimeSocketCount,
  dispatchRealtimeServerFrame,
  installRealtimeSocketProbe,
  realtimeSocketCloseCalls,
} from "./helpers/realtime-socket-probe";

test("closes the protocol stream instead of ignoring a malformed server frame", async ({
  page,
}) => {
  await installRealtimeSocketProbe(page);
  // This case verifies the browser's close/reconnect handshake, so it must not use Playwright's
  // transparent WebSocketRoute: that route intentionally owns and virtualizes close propagation.
  await openApp(page, { interceptRealtime: false });
  await expect.poll(() => activeRealtimeSocketCount(page)).toBe(1);

  const closeCallCount = (await realtimeSocketCloseCalls(page)).length;
  await dispatchRealtimeServerFrame(page, "{not-json");

  // Browser callers must use an application close code (3000..4999); 1002 is reserved for the
  // protocol stack and throws from WebSocket.close(), leaving the broken stream alive.
  await expect
    .poll(async () => (await realtimeSocketCloseCalls(page)).slice(closeCallCount))
    .toContainEqual({ code: 4002, reason: "Invalid realtime server frame" });
  await expect(page.getByTestId("app-ready")).toBeAttached();
});
