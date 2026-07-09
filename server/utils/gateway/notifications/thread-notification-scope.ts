import type { GatewayEvent } from "~~/shared/types";
import { parentThreadIdFromMetadata } from "../state/sub-agent-threads";
import type { ThreadMetadataResolver } from "../runtime/thread-runtime-events";

export async function shouldNotifyMainThread(
  event: GatewayEvent,
  resolveThread: ThreadMetadataResolver | undefined,
) {
  if (!resolveThread) {
    return false;
  }

  try {
    const result = await resolveThread();
    const thread = (result as any)?.thread ?? result;
    if (thread && typeof thread === "object") {
      return parentThreadIdFromMetadata(thread) === null;
    }
  } catch (error) {
    console.error("[gateway] failed to inspect thread scope before notification", {
      hostId: event.hostId,
      threadId: event.threadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Unknown scope is treated as notifiable=false to avoid child-agent false positives.
  return false;
}
