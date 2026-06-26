import { createError } from 'h3'
import { z } from 'zod'

const optionalPositiveInt = z.preprocess(
  (value) => value === '' || value == null ? undefined : value,
  z.coerce.number().int().positive().optional(),
)

const hostBaseSchema = z.object({
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
  proxyUrl: z.string().trim().nullable().optional().default('socks5h://127.0.0.1:7890'),
}).strict()

function validateHostProxy(host: z.infer<typeof hostBaseSchema>, ctx: z.RefinementCtx) {
  if (!host.proxyUrl) {
    return
  }
  try {
    const url = new URL(host.proxyUrl)
    if (url.protocol !== 'socks5:' && url.protocol !== 'socks5h:') {
      throw new Error('Unsupported proxy protocol')
    }
    if (!url.hostname || !url.port) {
      throw new Error('Proxy host and port are required')
    }
  } catch {
    ctx.addIssue({
      code: 'custom',
      path: ['proxyUrl'],
      message: 'Proxy URL must look like socks5h://127.0.0.1:7890',
    })
  }
}

export const hostCreateSchema = hostBaseSchema.superRefine(validateHostProxy)
export const hostUpdateSchema = hostBaseSchema.superRefine(validateHostProxy)

export const projectCreateSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  remotePath: z.string().trim().min(1),
})

export const gatewayConfigSchema = z.object({
  version: z.literal(1).default(1),
  hosts: z.array(hostBaseSchema.extend({
    id: z.coerce.number().int().positive(),
    hasPassword: z.boolean().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }).superRefine(validateHostProxy)).default([]),
  pinnedThreads: z.array(z.object({
    hostId: z.coerce.number().int().positive(),
    projectId: optionalPositiveInt.nullable().optional(),
    threadId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    subtitle: z.string().trim().nullable().optional(),
    projectName: z.string().trim().nullable().optional(),
    updatedAt: z.coerce.number().nullable().optional(),
  }).strict()).default([]),
  lastOpenThread: z.object({
    hostId: z.coerce.number().int().positive(),
    projectId: optionalPositiveInt.nullable().optional(),
    threadId: z.string().trim().min(1),
  }).strict().nullable().optional(),
}).strict()

export const remoteDirectoryListSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  path: z.string().trim().default('~'),
})

export const remoteImageSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  path: z.string().trim().min(1).refine((path) => path.startsWith('/'), {
    message: 'Remote image path must be absolute',
  }),
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

const threadSettingFields = {
  model: z.string().trim().nullable().optional(),
  effort: z.string().trim().min(1).nullable().optional(),
  approvalPolicy: z.enum(['untrusted', 'on-request', 'never']).nullable().optional(),
}

export const threadStartSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  projectId: optionalPositiveInt,
  cwd: z.string().trim().nullable().optional(),
  ...threadSettingFields,
})

export const threadSettingsUpdateSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  ...threadSettingFields,
})

export const turnStartSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  text: z.string().trim().default(''),
  clientUserMessageId: z.string().trim().nullable().optional(),
  cwd: z.string().trim().nullable().optional(),
  ...threadSettingFields,
  images: z.array(z.object({
    path: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1).optional(),
    detail: z.enum(['low', 'high', 'auto', 'original']).optional(),
  }).refine((image) => Boolean(image.path || image.url), {
    message: 'Image must include path or url',
  })).default([]),
  files: z.array(z.object({
    path: z.string().trim().min(1),
    name: z.string().trim().min(1),
    mimeType: z.string().trim().nullable().optional(),
    size: z.coerce.number().int().min(0),
    isImage: z.boolean(),
  })).default([]),
})

export const turnSteerSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  threadId: z.string().trim().min(1),
  expectedTurnId: z.string().trim().min(1),
  text: z.string().trim().default(''),
  clientUserMessageId: z.string().trim().nullable().optional(),
  images: z.array(z.object({
    path: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1).optional(),
    detail: z.enum(['low', 'high', 'auto', 'original']).optional(),
  }).refine((image) => Boolean(image.path || image.url), {
    message: 'Image must include path or url',
  })).default([]),
})

export const modelListSchema = z.object({
  hostId: z.coerce.number().int().positive(),
  includeHidden: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().nullable().optional(),
})

export const uploadQuerySchema = z.object({
  hostId: z.coerce.number().int().positive(),
})

export function requireRecord<T>(value: T | null | undefined, message: string): T {
  if (!value) {
    throw createError({ statusCode: 404, statusMessage: message })
  }
  return value
}
