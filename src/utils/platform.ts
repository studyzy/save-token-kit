import { homedir } from 'node:os'
import { exec } from 'tinyexec'

export type Platform = 'windows' | 'macos' | 'linux'

export function getPlatform(): Platform {
  const p = process.platform
  if (p === 'win32') return 'windows'
  if (p === 'darwin') return 'macos'
  return 'linux'
}

/** Check whether a CLI binary is available on PATH. */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const cmd = getPlatform() === 'windows' ? 'where' : 'which'
    const res = await exec(cmd, [command])
    return res.exitCode === 0 && res.stdout.trim().length > 0
  } catch {
    return false
  }
}

export function getHomeDir(): string {
  return homedir()
}

/** Check whether a process with the given name is currently running. */
export async function isProcessRunning(name: string): Promise<boolean> {
  try {
    const res = await exec('pgrep', ['-f', name])
    return res.exitCode === 0 && res.stdout.trim().length > 0
  } catch {
    return false
  }
}
