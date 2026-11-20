import { z } from "zod";

export const hostLifecycleMessageSchema = z
  .object({
    key: z.enum([
      "connecting",
      "checkingVersion",
      "repairingInstallation",
      "repairingStartup",
      "installing",
      "updatingDaemon",
      "restartingDaemon",
      "mfaRequired",
      "mfaDisconnected",
      "upgradeFailed",
      "upgradeComplete",
      "upgrading",
      "connected",
      "connectedVersion",
      "connectedUpgraded",
    ]),
    values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  })
  .strict();

export type HostLifecycleMessage = z.infer<typeof hostLifecycleMessageSchema>;
