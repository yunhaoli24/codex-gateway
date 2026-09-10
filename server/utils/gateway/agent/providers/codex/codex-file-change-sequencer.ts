/**
 * Single fileChange sequence counter.
 *
 * Previously duplicated in:
 * - the former raw item-lifecycle reducer
 * - app/stores/gateway/event-handlers/file-change-sequence.ts
 *
 * Now the Codex mapper is the single source of truth.
 */
import { recordFromUnknown, stringFromUnknown } from "~~/shared/utils/records";
import type { ThreadFileChange } from "~~/shared/types";

let fileChangeSequence = 0;

export function tagFileChanges(changes: unknown): ThreadFileChange[] {
  if (!Array.isArray(changes)) {
    return [];
  }
  return changes.flatMap((change) => {
    const record = recordFromUnknown(change);
    if (record === null) return [];
    const kindRecord = recordFromUnknown(record.kind);
    const kind =
      typeof record.kind === "string"
        ? record.kind
        : kindRecord
          ? {
              type: stringFromUnknown(kindRecord.type),
              kind: stringFromUnknown(kindRecord.kind),
            }
          : null;
    return [{ ...record, kind, sequence: ++fileChangeSequence }];
  });
}
