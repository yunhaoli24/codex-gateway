import type { GatewayEvent } from "~~/shared/types";
import { threadHistoryItemFromUnknown } from "~~/shared/runtime/app-server";
import { recordFromUnknown, stringIdFromUnknown, stringFromUnknown } from "~~/shared/utils/records";
import { gatewayDomainEvents } from "../domain-events";
import type { GatewayEventHandlerRegistry } from "./types";

interface TimelineItemContext {
  event: GatewayEvent;
  threadId: string;
  item: Record<string, unknown>;
}

type TimelineItemProjector = (context: TimelineItemContext) => void;

interface TimelineItemProjection {
  readonly matches: (item: Record<string, unknown>) => boolean;
  readonly project: TimelineItemProjector;
}

/**
 * How a canonical `timeline.item.upsert` projects into the local thread view.
 *
 * The provider mapper pre-builds every item (timestamps, tagged file changes,
 * embedded pendingApproval), so each projection below only decides which local
 * side effects accompany the plain timeline upsert. First matching rule wins;
 * items that satisfy none fall through to the started-lifecycle default.
 */
const timelineItemProjections: readonly TimelineItemProjection[] = [
  // Approval items (commandExecution / fileChange requestApproval) only project
  // into the timeline; the pendingApproval payload is already embedded.
  { matches: isApprovalItem, project: () => undefined },
  // fileChange/patchUpdated streams accumulated hunks while the edit is in
  // progress; the mapper already tagged the changes for sequencing.
  { matches: isFileChangePatch, project: emitRunningStatus },
  // item/completed: terminal side effects fire the process-completed chime and
  // the remote file-refresh signal.
  {
    matches: isCompletedLifecycleItem,
    project: composeProjectors(emitTerminalProcessCompleted, emitRemoteFilesChanged),
  },
];

export const itemEventHandlers: GatewayEventHandlerRegistry = {
  "timeline.item.upsert": (event, threadId) => {
    const canonical = event.event;
    if (canonical.type !== "timeline.item.upsert") return;
    const item = recordFromUnknown(canonical.item);
    if (item === null) return;
    const context: TimelineItemContext = { event, threadId, item };
    const projection = timelineItemProjections.find(({ matches }) => matches(item));
    if (projection === undefined) {
      // item/started lifecycle default; items the shared schema rejects are dropped.
      if (threadHistoryItemFromUnknown(item) === null) return;
      emitRunningStatus(context);
      return;
    }
    projection.project(context);
  },
};

function composeProjectors(...projectors: readonly TimelineItemProjector[]): TimelineItemProjector {
  return (context) => {
    for (const project of projectors) project(context);
  };
}

function isApprovalItem(item: Record<string, unknown>) {
  return stringFromUnknown(item.status) === "waitingForApproval";
}

function isFileChangePatch(item: Record<string, unknown>) {
  return (
    stringFromUnknown(item.type) === "fileChange" &&
    stringFromUnknown(item.status) === "inProgress" &&
    item.startedAt === undefined
  );
}

function isCompletedLifecycleItem(item: Record<string, unknown>) {
  return threadHistoryItemFromUnknown(item) !== null && item.completedAt !== undefined;
}

function emitRunningStatus({ event, threadId, item }: TimelineItemContext) {
  gatewayDomainEvents.emit("thread-status-detected", {
    hostId: event.hostId,
    threadId,
    status: "running",
    turnId: stringIdFromUnknown(item.turnId),
  });
}

function emitTerminalProcessCompleted({ event, threadId, item }: TimelineItemContext) {
  const validated = threadHistoryItemFromUnknown(item);
  const turnId = stringIdFromUnknown(item.turnId);
  if (validated?.type !== "commandExecution" || turnId === null || validated.id == null) return;
  gatewayDomainEvents.emit("terminal-process-completed", {
    hostId: event.hostId,
    threadId,
    turnId,
    itemId: String(validated.id),
  });
}

function emitRemoteFilesChanged({ event, threadId, item }: TimelineItemContext) {
  const validated = threadHistoryItemFromUnknown(item);
  if (validated?.type !== "fileChange") return;
  const paths = [
    ...new Set(
      (Array.isArray(validated.changes) ? validated.changes : []).flatMap(
        (change: Record<string, unknown>) =>
          [change.path, change.filePath, change.pathBefore, change.pathAfter].filter(
            (path: unknown): path is string => typeof path === "string" && path.length > 0,
          ),
      ),
    ),
  ];
  if (paths.length > 0)
    gatewayDomainEvents.emit("remote-files-changed", { hostId: event.hostId, threadId, paths });
}
