import { EventEmitter } from "node:events";

export interface BrowserFramePolicyEvent {
  userId: number;
  sessionId: string;
  policy: "x-frame-options" | "content-security-policy";
  value: string;
}

const events = new EventEmitter();

export const browserPreviewEvents = {
  publish(event: BrowserFramePolicyEvent) {
    events.emit("frame-policy", event);
  },
  subscribe(userId: number, listener: (event: BrowserFramePolicyEvent) => void) {
    const scoped = (event: BrowserFramePolicyEvent) => {
      if (event.userId === userId) listener(event);
    };
    events.on("frame-policy", scoped);
    return () => events.off("frame-policy", scoped);
  },
};
