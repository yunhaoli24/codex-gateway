import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'

export async function startCodexAppServer(port: number) {
  const proc = spawn('codex', ['app-server', '--listen', `ws://127.0.0.1:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CODEX_HOME: process.env.CODEX_HOME,
    },
  }) as ChildProcessWithoutNullStreams

  let stderr = ''
  proc.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })

  await waitForReady(port, proc, () => stderr)
  return {
    url: `ws://127.0.0.1:${port}`,
    stop: () => stopProcess(proc),
  }
}

async function waitForReady(port: number, proc: ChildProcessWithoutNullStreams, getStderr: () => string) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`codex app-server exited early: ${proc.exitCode}\n${getStderr()}`)
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/readyz`)
      if (response.ok) {
        return
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for codex app-server\n${getStderr()}`)
}

async function stopProcess(proc: ChildProcessWithoutNullStreams) {
  if (proc.exitCode !== null) {
    return
  }
  proc.kill('SIGTERM')
  await Promise.race([
    once(proc, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (proc.exitCode === null) {
    proc.kill('SIGKILL')
  }
}
