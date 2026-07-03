export interface ModelRecord {
  id: string;
  model: string;
  displayName: string;
  description?: string | null;
  hidden?: boolean;
  isDefault?: boolean;
  defaultReasoningEffort?: string | null;
  supportedReasoningEfforts?: Array<{
    reasoningEffort: string;
    description?: string | null;
  }>;
  inputModalities?: string[];
}

export interface ModelListResult {
  data: ModelRecord[];
  nextCursor?: string | null;
}
