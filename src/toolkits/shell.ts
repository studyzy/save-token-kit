import { exec } from 'tinyexec'

/** Run one shell step and report its exit code (tinyexec does NOT throw on non-zero). */
export async function runShell(cmd: string): Promise<{ exitCode: number; stderr: string }> {
  const res = await exec(cmd, { shell: true })
  return { exitCode: res.exitCode, stderr: res.stderr ?? '' }
}
