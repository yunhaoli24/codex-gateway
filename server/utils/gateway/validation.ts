import { createError } from 'h3'
import { z } from 'zod'

const optionalPositiveInt = z.preprocess(
  (value) => value === '' || value == null ? undefined : value,
  z.coerce.number().int().positive().optional(),
)

export const hostCreateSchema = z.object({
  name: z.string().trim().min(1),
  sshHost: z.string().trim().min(1),
  username: z.string().trim().nullable().optional(),
  port: z.preprocess(
    (value) => value === '' || value == null ? null : value,
    z.coerce.number().int().min(1).max(65535).nullable().optional(),
  ),
  authMode: z.enum(['agent', 'privateKey', 'password']).default('agent'),
  privateKeyPath: z.string().trim().nullable().optional(),
  privateKey: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
})

export const projectCreateSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  remotePath: z.string().trim().min(1),
})

export const gatewayConfigSchema = z.object({
  version: z.literal(1).default(1),
  hosts: z.array(hostCreateSchema.extend({
    id: z.coerce.number().int().positive(),
    hasPassword: z.boolean().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })).default([]),
  pinnedThreads: z.array(z.object({
    hostId: z.coerce.number().int().positive(),
    projectId: optionalPositiveInt.nullable().optional(),
    threadId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    subtitle: z.string().trim().nullable().optional(),
    hostName: z.string().trim().min(1),
    projectName: z.string().trim().nullable().optional(),
    updatedAt: z.coerce.number().nullable().optional(),
  })).default([]),
  lastOpenThread: z.object({
    hostId: z.coerce.number().int().positive(),
    projectId: optionalPositiveInt.nullable().optional(),
    threadId: z.string().trim().min(1),
  }).nullable().optional(),
})

export const remoteDirectoryListSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  path: z.string().trim().default('~'),
})

export const threadListSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  projectId: optionalPositiveInt,
  cwd: z.string().trim().nullable().optional(),
  searchTerm: z.string().trim().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().trim().nullable().optional(),
  useStateDbOnly: z.coerce.boolean().optional(),
})

export const threadOpenSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  projectId: optionalPositiveInt,
  threadId: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const threadTurnsListSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  cursor: z.string().trim().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
})

export const threadRenameSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
})

export const threadStartSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  projectId: optionalPositiveInt,
  cwd: z.string().trim().nullable().optional(),
  model: z.string().trim().nullable().optional(),
})

export const turnStartSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  text: z.string().trim().min(1),
  clientUserMessageId: z.string().trim().nullable().optional(),
  cwd: z.string().trim().nullable().optional(),
  images: z.array(z.object({
    path: z.string().trim().min(1),
    detail: z.enum(['low', 'high', 'auto', 'original']).optional(),
  })).default([]),
})

export function requireRecord<T>(value: T | null | undefined, message: string): T {
  if (!value) {
    throw createError({ statusCode: 404, statusMessage: message })
  }
  return value
}
