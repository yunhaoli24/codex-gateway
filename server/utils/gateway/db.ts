import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type {
  GatewayEvent,
  HostCreateInput,
  HostRecord,
  ProjectCreateInput,
  ProjectRecord,
} from '~~/shared/types'

type SqliteDatabase = Database.Database

let database: SqliteDatabase | null = null

function nowIso() {
  return new Date().toISOString()
}

function dataDir() {
  if (process.env.CODEX_GATEWAY_DATA_DIR) {
    mkdirSync(process.env.CODEX_GATEWAY_DATA_DIR, { recursive: true })
    return process.env.CODEX_GATEWAY_DATA_DIR
  }

  const dir = join(process.cwd(), '.data')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getDb() {
  if (database) {
    return database
  }

  database = new Database(join(dataDir(), 'gateway.sqlite'))
  database.pragma('journal_mode = WAL')
  database.exec(`
    create table if not exists hosts (
      id integer primary key autoincrement,
      name text not null,
      sshHost text not null,
      username text,
      port integer,
      authMode text not null default 'agent',
      privateKeyPath text,
      password text,
      appServerMode text not null default 'stdio',
      appServerUrl text,
      createdAt text not null,
      updatedAt text not null
    );

    create table if not exists projects (
      id integer primary key autoincrement,
      hostId integer not null references hosts(id) on delete cascade,
      name text not null,
      remotePath text not null,
      createdAt text not null,
      updatedAt text not null,
      unique(hostId, remotePath)
    );

    create table if not exists thread_metadata (
      hostId integer not null,
      projectId integer,
      threadId text not null,
      preview text,
      cwd text,
      updatedAt text not null,
      primary key(hostId, threadId)
    );

    create table if not exists gateway_events (
      id integer primary key autoincrement,
      hostId integer not null,
      threadId text not null,
      method text not null,
      payload text not null,
      createdAt text not null
    );

    create index if not exists idx_gateway_events_thread
      on gateway_events(hostId, threadId, id);
  `)
  ensureColumn(database, 'hosts', 'password', 'text')
  return database
}

type HostRow = HostRecord & { password?: string | null }

function sanitizeHost(row: HostRow): HostRecord {
  const { password, ...host } = row
  return {
    ...host,
    hasPassword: Boolean(password),
  }
}

export const persistence = {
  listHosts(): HostRecord[] {
    return (getDb().prepare('select * from hosts order by name asc').all() as HostRow[]).map(sanitizeHost)
  },

  getHost(id: number): HostRecord | null {
    const row = getDb().prepare('select * from hosts where id = ?').get(id) as HostRow | undefined
    return row ? sanitizeHost(row) : null
  },

  getHostWithSecret(id: number): HostRow | null {
    return (getDb().prepare('select * from hosts where id = ?').get(id) as HostRow | undefined) ?? null
  },

  createHost(input: HostCreateInput): HostRecord {
    const timestamp = nowIso()
    const info = getDb()
      .prepare(`
        insert into hosts (
          name, sshHost, username, port, authMode, privateKeyPath, password,
          appServerMode, appServerUrl, createdAt, updatedAt
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.name.trim(),
        input.sshHost.trim(),
        input.username?.trim() || null,
        input.port || null,
        input.authMode,
        input.privateKeyPath?.trim() || null,
        input.authMode === 'password' ? input.password || null : null,
        input.appServerMode || 'stdio',
        input.appServerUrl?.trim() || null,
        timestamp,
        timestamp,
      )

    return this.getHost(Number(info.lastInsertRowid))!
  },

  ensureLocalHost(): HostRecord {
    const existing = getDb()
      .prepare("select * from hosts where appServerMode = 'local' order by id asc limit 1")
      .get() as HostRow | undefined

    if (existing) {
      return sanitizeHost(existing)
    }

    return this.createHost({
      name: '本机 Codex',
      sshHost: 'local',
      username: null,
      port: null,
      authMode: 'agent',
      privateKeyPath: null,
      password: null,
      appServerMode: 'local',
      appServerUrl: null,
    })
  },

  deleteHost(id: number) {
    getDb().prepare('delete from hosts where id = ?').run(id)
  },

  listProjects(hostId?: number): ProjectRecord[] {
    const sql = hostId
      ? 'select * from projects where hostId = ? order by name asc'
      : 'select * from projects order by hostId asc, name asc'
    const params = hostId ? [hostId] : []
    return getDb().prepare(sql).all(...params) as ProjectRecord[]
  },

  getProject(id: number): ProjectRecord | null {
    return (getDb().prepare('select * from projects where id = ?').get(id) as ProjectRecord | undefined) ?? null
  },

  createProject(input: ProjectCreateInput): ProjectRecord {
    const timestamp = nowIso()
    getDb()
      .prepare(`
        insert into projects (hostId, name, remotePath, createdAt, updatedAt)
        values (?, ?, ?, ?, ?)
        on conflict(hostId, remotePath) do update set
          name = excluded.name,
          updatedAt = excluded.updatedAt
      `)
      .run(input.hostId, input.name.trim(), input.remotePath.trim(), timestamp, timestamp)

    const project = getDb()
      .prepare('select * from projects where hostId = ? and remotePath = ?')
      .get(input.hostId, input.remotePath.trim()) as ProjectRecord | undefined

    if (!project) {
      throw new Error(`Failed to save project for host ${input.hostId}: ${input.remotePath}`)
    }

    return project
  },

  ensureProjectForPath(hostId: number, remotePath: string): ProjectRecord {
    const normalizedPath = remotePath.trim()
    const name = normalizedPath.split('/').filter(Boolean).at(-1) || normalizedPath || 'root'
    return this.createProject({
      hostId,
      name,
      remotePath: normalizedPath,
    })
  },

  recordThread(hostId: number, projectId: number | null, thread: any) {
    const timestamp = nowIso()
    getDb()
      .prepare(`
        insert into thread_metadata (hostId, projectId, threadId, preview, cwd, updatedAt)
        values (?, ?, ?, ?, ?, ?)
        on conflict(hostId, threadId) do update set
          projectId = excluded.projectId,
          preview = excluded.preview,
          cwd = excluded.cwd,
          updatedAt = excluded.updatedAt
      `)
      .run(
        hostId,
        projectId,
        String(thread.id),
        thread.preview ?? thread.name ?? null,
        thread.cwd ?? null,
        timestamp,
      )
  },

  addGatewayEvent(hostId: number, threadId: string, method: string, payload: unknown): GatewayEvent {
    const timestamp = nowIso()
    const info = getDb()
      .prepare(`
        insert into gateway_events (hostId, threadId, method, payload, createdAt)
        values (?, ?, ?, ?, ?)
      `)
      .run(hostId, threadId, method, JSON.stringify(payload), timestamp)

    this.pruneGatewayEvents(hostId, threadId, 500)

    return {
      id: Number(info.lastInsertRowid),
      hostId,
      threadId,
      method,
      payload: payload as GatewayEvent['payload'],
      createdAt: timestamp,
    }
  },

  listGatewayEvents(hostId: number, threadId: string, afterId = 0, limit = 200): GatewayEvent[] {
    const rows = getDb()
      .prepare(`
        select * from gateway_events
        where hostId = ? and threadId = ? and id > ?
        order by id asc
        limit ?
      `)
      .all(hostId, threadId, afterId, limit) as Array<Omit<GatewayEvent, 'payload'> & { payload: string }>

    return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }))
  },

  pruneGatewayEvents(hostId: number, threadId: string, keep: number) {
    getDb()
      .prepare(`
        delete from gateway_events
        where hostId = ? and threadId = ? and id not in (
          select id from gateway_events
          where hostId = ? and threadId = ?
          order by id desc
          limit ?
        )
      `)
      .run(hostId, threadId, hostId, threadId, keep)
  },

  counts() {
    const hosts = getDb().prepare('select count(*) as count from hosts').get() as { count: number }
    const projects = getDb().prepare('select count(*) as count from projects').get() as { count: number }
    return { hosts: hosts.count, projects: projects.count }
  },
}

function ensureColumn(db: SqliteDatabase, table: string, column: string, definition: string) {
  const columns = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((item) => item.name === column)) {
    db.exec(`alter table ${table} add column ${column} ${definition}`)
  }
}
