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
  password: z.string().nullable().optional(),
  appServerMode: z.enum(['local', 'stdio', 'websocket']).default('stdio'),
  appServerUrl: z.string().trim().nullable().optional(),
})

export const projectCreateSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  remotePath: z.string().trim().min(1),
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
})

export const threadOpenSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  projectId: optionalPositiveInt,
  threadId: z.string().trim().min(1),
})

export const threadReadSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
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
})

export function requireRecord<T>(value: T | null | undefined, message: string): T {
  if (!value) {
    throw createError({ statusCode: 404, statusMessage: message })
  }
  return value
}
