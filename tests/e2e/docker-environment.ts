import { execFile } from 'node:child_process'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { Socket } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dockerDir = join(rootDir, 'tests', 'e2e', 'docker')
const runtimeDir = join(rootDir, '.e2e-runtime', 'ssh-container')
const envFile = join(runtimeDir, 'env.json')

export async function startDockerEnvironment() {
  await mkdir(runtimeDir, { recursive: true })
  await removeExistingContainers()
  const image = process.env.E2E_DOCKER_IMAGE || 'codex-gateway-e2e-ssh:latest'
  const container = `codex-gateway-e2e-${Date.now()}`
  const password = process.env.E2E_DOCKER_PASSWORD || 'codex'
  const port = process.env.E2E_DOCKER_SSH_PORT || '32222'
  const uid = String(typeof process.getuid === 'function' ? process.getuid() : 1000)
  const gid = String(typeof process.getgid === 'function' ? process.getgid() : 1000)
  const sourceCodexHome = process.env.E2E_CODEX_HOME || process.env.CODEX_HOME || join(homedir(), '.codex')
  const codexHome = join(runtimeDir, 'codex-home')
  await prepareCodexHome(sourceCodexHome, codexHome)

  await execFileAsync('docker', [
    'build',
    '--build-arg',
    `E2E_UID=${uid}`,
    '--build-arg',
    `E2E_GID=${gid}`,
    '-t',
    image,
    dockerDir,
  ], { cwd: rootDir, maxBuffer: 20 * 1024 * 1024 })

  await execFileAsync('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    container,
    '-p',
    `${port}:22`,
    '-e',
    'CODEX_HOME=/home/codex/.codex',
    '-v',
    `${rootDir}:/workspace/codex-gateway`,
    image,
  ], { cwd: rootDir })

  await execFileAsync('docker', ['cp', `${codexHome}/.`, `${container}:/home/codex/.codex`], { cwd: rootDir })
  await execFileAsync('docker', ['exec', container, 'chown', '-R', `${uid}:${gid}`, '/home/codex/.codex'], { cwd: rootDir })
  const imagePath = '/home/codex/e2e-image.png'
  await execFileAsync('docker', [
    'exec',
    container,
    'sh',
    '-lc',
    `printf %s iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg== | base64 -d > ${imagePath} && chown ${uid}:${gid} ${imagePath}`,
  ], { cwd: rootDir })

  const env = {
    container,
    host: '127.0.0.1',
    port,
    username: 'codex',
    password,
    projectPath: '/workspace/codex-gateway',
    imagePath,
  }
  await writeFile(envFile, JSON.stringify(env, null, 2))
  await waitForSsh(env.host, env.port)
  return env
}

export async function stopDockerEnvironment() {
  let container = ''
  try {
    const raw = await import('node:fs/promises').then((fs) => fs.readFile(envFile, 'utf8'))
    container = JSON.parse(raw).container || ''
  } catch {
    return
  }
  if (container) {
    await execFileAsync('docker', ['rm', '-f', container]).catch(() => undefined)
  }
  await rm(runtimeDir, { recursive: true, force: true })
}

async function removeExistingContainers() {
  const { stdout } = await execFileAsync('docker', [
    'ps',
    '-a',
    '--filter',
    'name=codex-gateway-e2e-',
    '--format',
    '{{.Names}}',
  ])
  const containers = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (containers.length) {
    await execFileAsync('docker', ['rm', '-f', ...containers]).catch(() => undefined)
  }
}

async function waitForSsh(host: string, port: string) {
  const deadline = Date.now() + 45_000
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      await waitForPort(host, Number(port), 2_000)
      return
    } catch (error: any) {
      lastError = error?.message || String(error)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error(`Timed out waiting for SSH container: ${lastError}`)
}

function waitForPort(host: string, port: number, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = new Socket()
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Timed out connecting to ${host}:${port}`))
    }, timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.end()
      resolve()
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      socket.destroy()
      reject(error)
    })
    socket.connect(port, host)
  })
}

export { envFile }

async function prepareCodexHome(sourceCodexHome: string, codexHome: string) {
  await rm(codexHome, { recursive: true, force: true })
  await mkdir(codexHome, { recursive: true })
  await Promise.all([
    copyOptional(join(sourceCodexHome, 'auth.json'), join(codexHome, 'auth.json')),
    copyOptional(join(sourceCodexHome, 'config.toml'), join(codexHome, 'config.toml')),
    copyOptional(join(sourceCodexHome, 'version.json'), join(codexHome, 'version.json')),
  ])
}

async function copyOptional(source: string, target: string) {
  try {
    await mkdir(dirname(target), { recursive: true })
    await copyFile(source, target)
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
}
