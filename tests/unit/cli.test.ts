import { describe, it, expect, vi, afterEach } from 'vitest'
import { main } from '@/cli.js'

// rollback 依赖真实 ~/.codebuddy/save-token-kit-backup/ 是否存在的机器状态，
// 这里把 os.homedir 隔离到一个不存在的目录，保证测试确定性（无备份 -> exitCode 1）。
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => '/tmp/stk-cli-nonexistent-home',
  }
})

describe('cli', () => {
  afterEach(() => {
    process.exitCode = undefined
  })

  it('registers commands and shows help without throwing', async () => {
    const orig = process.stdout.write
    process.stdout.write = () => true
    await expect(main(['--help'])).resolves.toBeUndefined()
    process.stdout.write = orig
  })

  it('reports unsupported agent for diagnose and sets exit code', async () => {
    const origErr = process.stderr.write
    process.stderr.write = () => true
    await main(['diagnose', '--agent', 'cursor'])
    expect(process.exitCode).toBe(1)
    process.stderr.write = origErr
  })

  it('errors on rollback (reserved) with exit code 1', async () => {
    const origErr = process.stderr.write
    process.stderr.write = () => true
    await main(['rollback'])
    expect(process.exitCode).toBe(1)
    process.stderr.write = origErr
  })
})
