import { EventEmitter } from "@posva/event-emitter";
import { currentGatewayUserId } from "../state/memory";

type SectionChange = { userId: number; hostId: number; threadId: string; sectionId: string | null };
const events = new EventEmitter<{ changed: SectionChange }>();
export const threadSectionEvents = {
  emit(hostId: number, threadId: string, sectionId: string | null) {
    const userId = currentGatewayUserId();
    if (userId !== null) events.emit("changed", { userId, hostId, threadId, sectionId });
  },
  subscribe(userId: number, listener: (event: SectionChange) => void) {
    return events.on("changed", (event) => {
      if (event.userId === userId) listener(event);
    });
  },
};
