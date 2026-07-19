import { Agent } from "agent-base";
import type { Duplex } from "node:stream";

export class BrowserPreviewHttpAgent extends Agent {
  constructor(private readonly connectUpstream: () => Promise<Duplex>) {
    // Browser pages fetch HTML, scripts, stylesheets, images, and API data in parallel. Reusing a
    // bounded pool here reuses SSH forwardOut channels as ordinary HTTP keep-alive sockets; it
    // does not create additional ssh2 Client connections.
    super({ keepAlive: true, maxSockets: 6, maxFreeSockets: 2 });
  }

  override connect() {
    return this.connectUpstream();
  }
}
