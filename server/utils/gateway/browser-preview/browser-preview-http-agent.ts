import { Agent } from "agent-base";
import type { Duplex } from "node:stream";

export class BrowserPreviewHttpAgent extends Agent {
  constructor(private readonly connectUpstream: () => Promise<Duplex>) {
    super({ keepAlive: false });
  }

  override connect() {
    return this.connectUpstream();
  }
}
