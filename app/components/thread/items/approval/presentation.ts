export type CodexApprovalActionLabel =
  | "app.approveForTurn"
  | "app.approveForSession"
  | "app.cancel"
  | "app.decline";

export interface CodexApprovalAction {
  id: "approve-turn" | "approve-session" | "decline" | "cancel";
  label: CodexApprovalActionLabel;
  result: unknown;
  testId: string;
  variant: "default" | "outline";
}

export interface CodexApprovalPresentation {
  actions: CodexApprovalAction[];
  approval: { id: string };
  phase: "requested" | "resolved";
  requestId: string | number | null;
  respondable: boolean;
  state: "approval-requested" | "output-available";
}

interface CodexApprovalSourceBase {
  requestId: unknown;
  pending: boolean;
  canRespond: boolean;
  presentationId: string;
}

type CodexApprovalSource =
  | (CodexApprovalSourceBase & {
      kind: "command" | "humanCommand" | "fileChange";
    })
  | (CodexApprovalSourceBase & {
      kind: "permissions";
      permissions: unknown;
    });

export function projectCodexApproval(source: CodexApprovalSource): CodexApprovalPresentation {
  const requestId = approvalRequestId(source.requestId);
  const approval = { id: requestId === null ? source.presentationId : String(requestId) };
  if (source.pending) {
    return {
      actions: approvalActions(source),
      approval,
      phase: "requested",
      requestId,
      respondable: source.canRespond,
      state: "approval-requested",
    };
  }

  // serverRequest/resolved removes requestId and pendingApproval from Gateway history but does not
  // persist whether the user accepted or declined. Keep that truthful "handled" state instead of
  // manufacturing AI SDK approved/rejected booleans from a completed command or file status.
  return {
    actions: [],
    approval,
    phase: "resolved",
    requestId,
    respondable: false,
    state: "output-available",
  };
}

function approvalActions(source: CodexApprovalSource): CodexApprovalAction[] {
  const prefix = source.kind === "fileChange" ? "file" : source.kind;
  // Managed human checkpoints explicitly prohibit session grants and saved rule amendments.
  // Keep this mapping here, shared by every approval view, rather than filtering buttons in CSS.
  if (source.kind === "humanCommand") {
    return [
      action(
        "approve-turn",
        "app.approveForTurn",
        { decision: "accept" },
        `${prefix}-accept`,
        "default",
      ),
      action("decline", "app.decline", { decision: "decline" }, `${prefix}-decline`, "outline"),
      action("cancel", "app.cancel", { decision: "cancel" }, `${prefix}-cancel`, "outline"),
    ];
  }
  if (source.kind === "permissions") {
    return [
      action(
        "approve-turn",
        "app.approveForTurn",
        { permissions: source.permissions, scope: "turn" },
        `${prefix}-approval-turn`,
        "default",
      ),
      action(
        "approve-session",
        "app.approveForSession",
        { permissions: source.permissions, scope: "session" },
        `${prefix}-approval-session`,
        "outline",
      ),
      action(
        "decline",
        "app.decline",
        { permissions: {}, scope: "turn" },
        `${prefix}-approval-decline`,
        "outline",
      ),
    ];
  }

  return [
    action(
      "approve-turn",
      "app.approveForTurn",
      { decision: "accept" },
      `${prefix}-approval-accept`,
      "default",
    ),
    action(
      "approve-session",
      "app.approveForSession",
      { decision: "acceptForSession" },
      `${prefix}-approval-session`,
      "outline",
    ),
    action(
      "decline",
      "app.decline",
      { decision: "decline" },
      `${prefix}-approval-decline`,
      "outline",
    ),
  ];
}

function action(
  id: CodexApprovalAction["id"],
  label: CodexApprovalActionLabel,
  result: unknown,
  testId: string,
  variant: CodexApprovalAction["variant"],
): CodexApprovalAction {
  return { id, label, result, testId, variant };
}

function approvalRequestId(value: unknown): string | number | null {
  if (typeof value === "string") return value === "" ? null : value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
