import type { FilePreviewDocument } from "~~/shared/types";
import { loadFileDocument } from "./document-runtime";

interface DocumentRead {
  controller: AbortController;
  refreshAgain: boolean;
}

/** Like VS Code's per-resource reload queue, retain one running read and one coalesced refresh.
 * A remote edit must not abort a large download and start it from zero. Only closing the document
 * or disposing the authenticated workspace cancels its read. */
export class FileDocumentLoader {
  private readonly pending = new Map<
    FilePreviewDocument,
    { read: DocumentRead; promise: Promise<void> }
  >();

  constructor(
    private readonly accept: (document: FilePreviewDocument, file: File | null) => void,
  ) {}

  load(document: FilePreviewDocument) {
    const pending = this.pending.get(document);
    if (pending !== undefined) {
      pending.read.refreshAgain = true;
      return pending.promise;
    }
    const read: DocumentRead = { controller: new AbortController(), refreshAgain: false };
    const promise = this.run(document, read).finally(() => {
      if (this.pending.get(document)?.read === read) this.pending.delete(document);
    });
    this.pending.set(document, { read, promise });
    return promise;
  }

  invalidate(document: FilePreviewDocument) {
    document.stale = true;
    const pending = this.pending.get(document);
    // stale is a UI hint, not a queue generation: another write can arrive while it is already
    // true. Record it here so completion of the older read cannot swallow that notification.
    if (pending !== undefined) pending.read.refreshAgain = true;
  }

  cancel(document: FilePreviewDocument) {
    this.pending.get(document)?.read.controller.abort();
    this.pending.delete(document);
  }

  reset() {
    for (const { read } of this.pending.values()) read.controller.abort();
    this.pending.clear();
  }

  private async run(document: FilePreviewDocument, read: DocumentRead) {
    do {
      read.refreshAgain = false;
      const file = await loadFileDocument(document, read.controller.signal);
      if (read.controller.signal.aborted) return;
      if (file !== undefined) this.accept(document, file);
    } while (read.refreshAgain);
  }
}
