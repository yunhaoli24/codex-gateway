import { diff } from "@codemirror/merge";
import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export function synchronizeEditorDocument(view: EditorView, value: string) {
  const previous = view.state.doc.toString();
  const next = value.includes("\r") ? view.state.toText(value).toString() : value;
  if (previous === next) return;

  // VS Code reloads update the changed region instead of replacing the entire model. Use
  // CodeMirror's own bounded diff and transaction mapping so syntax/Git decorations, selection
  // and the visible scroll anchor survive an external edit. This is an editor optimization,
  // not a second file-sync protocol: SFTP remains the source of the complete new contents.
  const changes = view.state.changes(
    diff(previous, next, { scanLimit: 500, timeout: 20 }).map((change) => ({
      from: change.fromA,
      to: change.toA,
      insert: next.slice(change.fromB, change.toB),
    })),
  );
  view.dispatch({
    changes,
    effects: view.scrollSnapshot().map(changes),
    annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
  });
}
