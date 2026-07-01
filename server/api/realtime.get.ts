import {
  cleanupRealtimePeer,
  handleRealtimePeerMessage,
  openRealtimePeer,
} from "../utils/gateway/realtime/connection";

export default defineWebSocketHandler({
  open(peer) {
    openRealtimePeer(peer);
  },

  async message(peer, message) {
    await handleRealtimePeerMessage(peer, message.text());
  },

  close(peer) {
    cleanupRealtimePeer(peer);
  },

  error(peer) {
    cleanupRealtimePeer(peer);
  },
});
