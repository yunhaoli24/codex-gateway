import type { VirtualizerOptions } from "@tanstack/virtual-core";

type ChatVirtualizerBehavior = Pick<
  VirtualizerOptions<HTMLElement, Element>,
  "anchorTo" | "followOnAppend" | "scrollEndThreshold"
>;

export function createChatVirtualizerBehavior(scrollEndThreshold: number): ChatVirtualizerBehavior {
  // This is TanStack Virtual's official Chat contract. Stable keys plus permanent end anchoring
  // let virtual-core preserve prepended history, follow appended rows only when already at the
  // latest content, and keep a streaming final row pinned as its measured height changes.
  //
  // We used this same mode in 41100a44, then changed detached readers to `anchorTo: "start"` after
  // virtual-core 3.17.4 could misclassify transient end distance and pull the viewport downward.
  // Upstream 3.17.6 fixed viewport-spanning streaming growth (#1236), and 3.17.7 made resize
  // compensation and row transforms commit in the same frame (#1239). Do not restore the old
  // dynamic anchor, custom size predicate, or manual scrollTop compensation: each overrides the
  // now-correct core transaction and recreates the jump that those releases removed.
  // 3.19.5+ also distinguishes native iOS momentum from programmatic scrolling (#1318) and fixes
  // clamped end-scroll read-backs (#1329/#1330). Use those upstream transactions, not our former
  // pnpm patch or a second gesture/correction state machine in the Vue adapter.
  //
  // This config belongs only to the unbounded outer Agent timeline. Bounded diff and command
  // outputs own separate inner scrollports and must never drive this virtualizer.
  return {
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold,
  };
}
