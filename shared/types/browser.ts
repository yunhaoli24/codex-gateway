export interface BrowserPreviewTarget {
  hostId: number;
  projectId?: number | null;
  threadId?: string | null;
  panelId: string;
  targetUrl: string;
  allowInsecureTls?: boolean;
}

export interface BrowserPreviewSessionSnapshot extends BrowserPreviewTarget {
  sessionId: string;
  previewOrigin: string;
  bootstrapUrl: string;
  status: "open" | "closed";
}
