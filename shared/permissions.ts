import { z } from "zod";
import type { ApprovalPolicy } from "./types/thread";

// These are the official 0.166.0 SandboxPolicy DTO variants. Keep the full policy when
// hydrating settings: its network and writable-root restrictions matter to the picker label.
export const sandboxPolicySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("dangerFullAccess") }),
  z.object({ type: z.literal("readOnly"), networkAccess: z.boolean() }),
  z.object({
    type: z.literal("externalSandbox"),
    networkAccess: z.enum(["restricted", "enabled"]),
  }),
  z.object({
    type: z.literal("workspaceWrite"),
    writableRoots: z.array(z.string()),
    networkAccess: z.boolean(),
    excludeTmpdirEnvVar: z.boolean(),
    excludeSlashTmp: z.boolean(),
  }),
]);

export type SandboxPolicy = z.infer<typeof sandboxPolicySchema>;
export const sandboxModeSchema = z.enum(["read-only", "workspace-write", "danger-full-access"]);
export type SandboxMode = z.infer<typeof sandboxModeSchema>;
export type PermissionPreset = ApprovalPolicy | "custom";

// Only explicit picker actions use this mapping. Hydrated approvalPolicy must never be
// interpreted as an instruction to expand a sandbox on a later turn/start.
export function permissionPresetSettings(preset: ApprovalPolicy): {
  approvalPolicy: ApprovalPolicy;
  sandbox: SandboxMode;
  sandboxPolicy: SandboxPolicy;
} {
  return {
    approvalPolicy: preset,
    sandbox: preset === "never" ? "danger-full-access" : "workspace-write",
    sandboxPolicy:
      preset === "never"
        ? { type: "dangerFullAccess" }
        : {
            type: "workspaceWrite",
            writableRoots: [],
            networkAccess: false,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false,
          },
  };
}

export function permissionPresetFromSettings(settings: {
  approvalPolicy?: ApprovalPolicy | null;
  sandboxPolicy?: SandboxPolicy | null;
}): PermissionPreset {
  const { approvalPolicy, sandboxPolicy } = settings;
  if (approvalPolicy === "never" && sandboxPolicy?.type === "dangerFullAccess") return "never";
  if (
    (approvalPolicy === "untrusted" || approvalPolicy === "on-request") &&
    sandboxPolicy?.type === "workspaceWrite" &&
    !sandboxPolicy.networkAccess &&
    sandboxPolicy.writableRoots.length === 0 &&
    !sandboxPolicy.excludeTmpdirEnvVar &&
    !sandboxPolicy.excludeSlashTmp
  )
    return approvalPolicy;
  return "custom";
}
