import type { ServerOptions } from "ws";

export default defineNitroPlugin((nitroApp) => {
  // Nitro passes this public H3 adapter options object to CrossWS's Node adapter. Configure the
  // existing transport before it is created: browsers negotiate/decompress the standard extension
  // transparently, so JSON schemas and terminal binary framing need no parallel codec or socket.
  const serverOptions = {
    perMessageDeflate: {
      threshold: 1024,
      serverNoContextTakeover: true,
      clientNoContextTakeover: true,
      serverMaxWindowBits: 12,
      clientMaxWindowBits: 12,
      concurrencyLimit: 2,
      zlibDeflateOptions: { level: 3, memLevel: 4 },
    },
  } satisfies ServerOptions;
  // Small deltas stay uncompressed. Bounded windows, no retained dictionaries and low zlib
  // concurrency avoid trading bandwidth savings for large per-client native-memory allocations.
  Object.assign(nitroApp.h3App.websocket, { serverOptions });
});
