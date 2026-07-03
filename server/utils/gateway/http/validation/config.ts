import { z } from "zod";
import type { GatewayConfig } from "~~/shared/types";
import { DEFAULT_BARK_GROUP, DEFAULT_BARK_SERVER_URL } from "~~/shared/config";
import { optionalPositiveInt } from "./common";
import { hostBaseSchema, validateHostProxy } from "./hosts-projects";

export const gatewayConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    hosts: z
      .array(
        hostBaseSchema
          .extend({
            id: z.coerce.number().int().positive(),
            hasPassword: z.boolean().optional(),
            createdAt: z.string().optional(),
            updatedAt: z.string().optional(),
          })
          .superRefine(validateHostProxy),
      )
      .default([]),
    projects: z
      .array(
        z
          .object({
            id: z.coerce.number().int().positive(),
            hostId: z.coerce.number().int().positive(),
            name: z.string().trim().min(1),
            remotePath: z.string().trim().min(1),
            createdAt: z.string().optional(),
            updatedAt: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    pinnedThreads: z
      .array(
        z
          .object({
            hostId: z.coerce.number().int().positive(),
            projectId: optionalPositiveInt.nullable().optional(),
            threadId: z.string().trim().min(1),
            title: z.string().trim().min(1),
            subtitle: z.string().trim().nullable().optional(),
            projectName: z.string().trim().nullable().optional(),
            updatedAt: z.coerce.number().nullable().optional(),
          })
          .strict(),
      )
      .default([]),
    lastOpenThread: z
      .object({
        hostId: z.coerce.number().int().positive(),
        projectId: optionalPositiveInt.nullable().optional(),
        threadId: z.string().trim().min(1),
      })
      .strict()
      .nullable()
      .optional(),
    notifications: z
      .object({
        bark: z
          .object({
            enabled: z.boolean().default(false),
            serverUrl: z.string().trim().url().default(DEFAULT_BARK_SERVER_URL),
            deviceKey: z.string().trim().default(""),
            group: z.string().trim().nullable().optional().default(DEFAULT_BARK_GROUP),
          })
          .strict()
          .default({
            enabled: false,
            serverUrl: DEFAULT_BARK_SERVER_URL,
            deviceKey: "",
            group: DEFAULT_BARK_GROUP,
          }),
      })
      .strict()
      .default({
        bark: {
          enabled: false,
          serverUrl: DEFAULT_BARK_SERVER_URL,
          deviceKey: "",
          group: DEFAULT_BARK_GROUP,
        },
      }),
  })
  .strict();

export function parseGatewayConfig(body: unknown): GatewayConfig {
  const input = gatewayConfigSchema.parse(body);
  const timestamp = new Date().toISOString();
  return {
    version: 1,
    hosts: input.hosts.map((host) => ({
      id: host.id,
      name: host.name.trim(),
      sshHost: host.sshHost.trim(),
      username: host.username?.trim() || null,
      port: host.port ?? null,
      authMode: host.authMode,
      privateKeyPath: host.privateKeyPath?.trim() || null,
      privateKey: host.privateKey || null,
      password: host.password || null,
      proxyUrl: host.proxyUrl?.trim() || null,
      hasPassword: Boolean(host.password || host.hasPassword),
      createdAt: host.createdAt || timestamp,
      updatedAt: host.updatedAt || timestamp,
    })),
    projects: input.projects.map((project) => ({
      id: project.id,
      hostId: project.hostId,
      name: project.name.trim(),
      remotePath: project.remotePath.trim(),
      createdAt: project.createdAt || timestamp,
      updatedAt: project.updatedAt || timestamp,
    })),
    pinnedThreads: input.pinnedThreads.map((thread) => ({
      hostId: thread.hostId,
      projectId: thread.projectId ?? null,
      threadId: thread.threadId.trim(),
      title: thread.title.trim(),
      subtitle: thread.subtitle?.trim() || null,
      projectName: thread.projectName?.trim() || null,
      updatedAt: thread.updatedAt ?? null,
    })),
    notifications: {
      bark: {
        enabled: input.notifications.bark.enabled,
        serverUrl: input.notifications.bark.serverUrl.trim() || DEFAULT_BARK_SERVER_URL,
        deviceKey: input.notifications.bark.deviceKey.trim(),
        group: input.notifications.bark.group?.trim() || DEFAULT_BARK_GROUP,
      },
    },
    lastOpenThread: input.lastOpenThread
      ? {
          hostId: input.lastOpenThread.hostId,
          projectId: input.lastOpenThread.projectId ?? null,
          threadId: input.lastOpenThread.threadId.trim(),
        }
      : null,
  };
}
