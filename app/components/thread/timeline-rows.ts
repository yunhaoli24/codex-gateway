import type { ThreadResponseUsage, ThreadTimelineItem, ThreadTimelineTurn } from "~~/shared/types";
import type { DisplayedTurnTiming } from "@/utils/turn-timing";
import { itemKey, type ThreadTurnSections } from "./thread-turn-sections";

export type { ThreadTimelineTurn } from "~~/shared/types";

type ThreadTimelineItemSection = "user" | "intermediate" | "final";

const estimatedItemHeights: Partial<Record<ThreadTimelineItem["type"], number>> = {
  commandExecution: 48,
  fileChange: 440,
  agentMessage: 144,
  reasoning: 128,
  userMessage: 160,
};

export type ThreadTimelineRow =
  | { key: string; type: "loadMore"; turnId: string; loading: boolean }
  | {
      key: string;
      type: "intermediateHeader";
      turnId: string;
      count: number;
      open: boolean;
      loading: boolean;
    }
  | {
      key: string;
      type: "item";
      turnId: string;
      section: ThreadTimelineItemSection;
      item: ThreadTimelineItem;
      turnTiming: DisplayedTurnTiming | null;
      responseUsage: ThreadResponseUsage[] | undefined;
      agentActionsAvailable: boolean;
    }
  | {
      key: string;
      type: "turnDuration";
      turnId: string;
      startedAt: number | null;
      completedAt: number | null;
      durationMs: number | null;
      active: boolean;
      responseUsage: ThreadResponseUsage[] | undefined;
    };

export interface ThreadTimelineTurnState {
  turn: ThreadTimelineTurn;
  sections: ThreadTurnSections;
  intermediateOpen: boolean;
  intermediateLoading: boolean;
}

// Every visible entry is a direct row of the Agent timeline. Do not wrap intermediate items in a
// second virtualizer: two height caches sharing one scroll element can leave stale blank space on
// WebKit. Collapsing is represented only by omitting intermediate item rows from this flat model.
export function buildThreadTimelineRows(input: {
  threadId: string | null;
  turns: ThreadTimelineTurnState[];
  agentActionsAvailable: boolean;
}) {
  return input.turns.flatMap(({ turn, sections, intermediateOpen, intermediateLoading }) => {
    const rows: ThreadTimelineRow[] = [];
    const timing = displayedTurnTiming(turn);
    const timingTarget = sections.finalItems.findLast((item) => item.type === "agentMessage");
    appendTurnItemsInOrder({
      rows,
      threadId: input.threadId,
      turn,
      sections,
      intermediateOpen,
      intermediateLoading,
      timingTarget,
      timing,
      agentActionsAvailable: input.agentActionsAvailable,
    });
    if (intermediateOpen && typeof turn.olderItemsCursor === "string") {
      const header = rows.findIndex((row) => row.type === "intermediateHeader");
      rows.splice(header + 1, 0, {
        key: `${input.threadId}:turn-${turn.id}:load-more`,
        type: "loadMore",
        turnId: turn.id,
        loading: intermediateLoading,
      });
    }
    // Completed turns normally render timing beside the final answer's copy action. Keep a
    // standalone row only for interrupted/error turns that never produced an Agent answer.
    if (
      input.agentActionsAvailable &&
      (hasTimingValue(timing) || (turn.responseUsage?.length ?? 0) > 0) &&
      timingTarget === undefined
    ) {
      rows.push({
        key: `${input.threadId}:turn-${turn.id}:duration`,
        type: "turnDuration",
        turnId: turn.id,
        ...timing,
        responseUsage: turn.responseUsage,
      });
    }
    return rows;
  });
}

function appendTurnItemsInOrder(input: {
  rows: ThreadTimelineRow[];
  threadId: string | null;
  turn: ThreadTimelineTurn;
  sections: ThreadTurnSections;
  intermediateOpen: boolean;
  intermediateLoading: boolean;
  timingTarget: ThreadTimelineItem | undefined;
  timing: DisplayedTurnTiming;
  agentActionsAvailable: boolean;
}) {
  const { rows, threadId, turn, sections } = input;
  const intermediateItems = new Set(sections.intermediateItems);
  const finalItems = new Set(sections.finalItems);
  let intermediateHeaderAdded = false;

  // The shared history reducer owns protocol race normalization. Rendering must preserve that
  // canonical order verbatim; a second presentation sort would make live events, cached history,
  // and other consumers disagree about the same Turn.
  sections.items.forEach((item) => {
    const isFinal = finalItems.has(item);
    const isIntermediate = intermediateItems.has(item) && !isFinal;
    const needsUnloadedIntermediateHeader = isFinal && turn.itemsView !== "full";
    if (!intermediateHeaderAdded && (isIntermediate || needsUnloadedIntermediateHeader)) {
      rows.push({
        key: `${threadId}:turn-${turn.id}:intermediate-header`,
        type: "intermediateHeader",
        turnId: turn.id,
        count: sections.intermediateItems.length,
        open: input.intermediateOpen,
        loading: input.intermediateLoading,
      });
      intermediateHeaderAdded = true;
    }
    if (isIntermediate && !input.intermediateOpen) return;

    const section = isIntermediate ? "intermediate" : isFinal ? "final" : "user";
    appendItemRows(
      rows,
      threadId,
      turn.id,
      section,
      [item],
      sections,
      item === input.timingTarget ? item : undefined,
      item === input.timingTarget ? input.timing : null,
      item === input.timingTarget && input.agentActionsAvailable,
      item === input.timingTarget ? turn.responseUsage : undefined,
    );
  });

  // An active summary can temporarily contain only its lead message. In that case the lazy-load
  // control still belongs at this turn's tail; once a final answer arrives, the branch above moves
  // it before that answer without changing the canonical app-server item order.
  if (!intermediateHeaderAdded && turn.itemsView !== "full") {
    rows.push({
      key: `${threadId}:turn-${turn.id}:intermediate-header`,
      type: "intermediateHeader",
      turnId: turn.id,
      count: sections.intermediateItems.length,
      open: input.intermediateOpen,
      loading: input.intermediateLoading,
    });
  }
}

export function reuseUnchangedTimelineRows(
  previous: ThreadTimelineRow[] | undefined,
  next: ThreadTimelineRow[],
) {
  if (previous === undefined || previous.length === 0) return next;
  const previousByKey = new Map(previous.map((row) => [row.key, row]));
  return next.map((row) => {
    const candidate = previousByKey.get(row.key);
    return candidate !== undefined && sameTimelineRow(candidate, row) ? candidate : row;
  });
}

export function estimateThreadTimelineRow(row: ThreadTimelineRow | undefined) {
  if (row === undefined) return 96;
  if (row.type === "intermediateHeader" || row.type === "loadMore") return 48;
  if (row.type === "turnDuration") return 28;
  return estimatedItemHeights[row.item.type] ?? 96;
}

function appendItemRows(
  rows: ThreadTimelineRow[],
  threadId: string | null,
  turnId: string,
  section: ThreadTimelineItemSection,
  items: ThreadTimelineItem[],
  sections: ThreadTurnSections,
  timingTarget?: ThreadTimelineItem,
  timing: DisplayedTurnTiming | null = null,
  agentActionsAvailable = false,
  responseUsage?: ThreadResponseUsage[],
) {
  items.forEach((item, index) => {
    rows.push({
      key: `${threadId}:turn-${turnId}:${section}:${itemKey(item, section, index)}`,
      type: "item",
      turnId,
      section,
      item,
      turnTiming: item === timingTarget ? timing : null,
      responseUsage: item === timingTarget ? responseUsage : undefined,
      agentActionsAvailable: item === timingTarget && agentActionsAvailable,
    });
  });
}

function displayedTurnTiming(turn: ThreadTimelineTurn): DisplayedTurnTiming {
  return {
    startedAt: typeof turn.startedAt === "number" ? turn.startedAt : null,
    completedAt: typeof turn.completedAt === "number" ? turn.completedAt : null,
    durationMs: turn.durationMs ?? null,
    active: turn.status === "inProgress",
  };
}

function hasTimingValue(timing: DisplayedTurnTiming) {
  return timing.startedAt !== null || timing.durationMs !== null;
}

function sameTimelineRow(left: ThreadTimelineRow, right: ThreadTimelineRow) {
  if (left.type !== right.type) return false;
  if (left.type === "loadMore" && right.type === "loadMore") {
    return left.turnId === right.turnId && left.loading === right.loading;
  }
  if (left.type === "intermediateHeader" && right.type === "intermediateHeader") {
    return (
      left.count === right.count &&
      left.open === right.open &&
      left.loading === right.loading &&
      left.turnId === right.turnId
    );
  }
  if (left.type === "item" && right.type === "item") {
    // App-server deltas mutate this reactive item proxy in place. Reuse the lightweight row wrapper
    // so unrelated mounted Markdown rows do not rerender, but never clone or mark the item raw:
    // nested text/output reactivity is the official Vue update path that feeds TanStack's row
    // ResizeObserver. A separate presentation revision would duplicate timeline state.
    return (
      left.item === right.item &&
      left.turnId === right.turnId &&
      left.section === right.section &&
      left.agentActionsAvailable === right.agentActionsAvailable &&
      sameResponseUsage(left.responseUsage, right.responseUsage) &&
      sameTurnTiming(left.turnTiming, right.turnTiming)
    );
  }
  if (left.type === "turnDuration" && right.type === "turnDuration") {
    return (
      left.turnId === right.turnId &&
      left.startedAt === right.startedAt &&
      left.completedAt === right.completedAt &&
      left.durationMs === right.durationMs &&
      left.active === right.active &&
      sameResponseUsage(left.responseUsage, right.responseUsage)
    );
  }
  return false;
}

function sameResponseUsage(
  left: ThreadResponseUsage[] | undefined,
  right: ThreadResponseUsage[] | undefined,
) {
  if (left === right) return true;
  if (left === undefined || right === undefined || left.length !== right.length) return false;
  return left.every(
    (usage, index) =>
      usage.responseId === right[index]?.responseId && usage.amount === right[index]?.amount,
  );
}

function sameTurnTiming(left: DisplayedTurnTiming | null, right: DisplayedTurnTiming | null) {
  if (left === null || right === null) return left === right;
  return (
    left.startedAt === right.startedAt &&
    left.completedAt === right.completedAt &&
    left.durationMs === right.durationMs &&
    left.active === right.active
  );
}
