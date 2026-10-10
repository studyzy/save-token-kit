import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { evaluateSpec, type SpecContext, type SpecDeps } from '../../../src/toolkits/spec.js'

function ctx(overrides: Partial<SpecContext> = {}): SpecContext {
  return {
    home: '/fake/home',
    mcpList: [],
    hookList: [],
    proxyParsed: null,
    settingsJson: null,
    ...overrides,
  }
}

function deps(overrides: Partial<SpecDeps> = {}): SpecDeps {
  return { ...overrides }
}

const tmpBase = mkdtempSync(join(tmpdir(), 'stk-spec-'))

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true })
})

describe('evaluateSpec — command', () => {
  it('命令存在 → true', async () => {
    const ce = vi.fn().mockResolvedValue(true)
    const ok = await evaluateSpec({ kind: 'command', name: 'rtk' }, ctx(), deps({ commandExists: ce }))
    expect(ok).toBe(true)
    expect(ce).toHaveBeenCalledWith('rtk')
  })

  it('命令不存在 → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'command', name: 'no-such-cli' },
      ctx(),
      deps({ commandExists: async () => false }),
    )
    expect(ok).toBe(false)
  })

  it('commandExists 抛错 → false（宁漏不误）', async () => {
    const ok = await evaluateSpec(
      { kind: 'command', name: 'rtk' },
      ctx(),
      deps({ commandExists: async () => { throw new Error('boom') } }),
    )
    expect(ok).toBe(false)
  })
})

describe('evaluateSpec — path', () => {
  it('存在的绝对路径 → true', async () => {
    const dir = join(tmpBase, 'abs-exists')
    mkdirSync(dir, { recursive: true })
    const ok = await evaluateSpec({ kind: 'path', path: dir }, ctx(), deps())
    expect(ok).toBe(true)
  })

  it('不存在的绝对路径 → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'path', path: join(tmpBase, 'missing') },
      ctx(),
      deps(),
    )
    expect(ok).toBe(false)
  })

  it('~ 前缀按 ctx.home 展开', async () => {
    mkdirSync(join(tmpBase, '.stk-check'), { recursive: true })
    const ok = await evaluateSpec({ kind: 'path', path: '~/.stk-check' }, ctx({ home: tmpBase }), deps())
    expect(ok).toBe(true)
  })

  it('~ 不存在的路径 → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'path', path: '~/.no-such-dir-xyz' },
      ctx({ home: join(tmpBase, 'nothome') }),
      deps(),
    )
    expect(ok).toBe(false)
  })

  it('相对路径基于 deps.cwd', async () => {
    const dir = join(tmpBase, 'rel-base')
    mkdirSync(join(dir, 'graphify-out'), { recursive: true })
    const ok = await evaluateSpec(
      { kind: 'path', path: 'graphify-out' },
      ctx(),
      deps({ cwd: dir }),
    )
    expect(ok).toBe(true)
  })

  it('相对路径 cwd 下不存在 → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'path', path: '.codegraph' },
      ctx(),
      deps({ cwd: tmpBase }),
    )
    expect(ok).toBe(false)
  })
})

describe('evaluateSpec — mcp', () => {
  const fsCtx = ctx({
    mcpList: [
      { name: 'gitnexus', status: 'enabled' },
      { name: 'codegraph', status: 'disabled' },
    ],
  })

  it('fs 源命中 enabled 项 → true', async () => {
    const ok = await evaluateSpec({ kind: 'mcp', names: ['gitnexus'] }, fsCtx, deps())
    expect(ok).toBe(true)
  })

  it('fs 源仅 disabled 项 → false', async () => {
    const ok = await evaluateSpec({ kind: 'mcp', names: ['codegraph'] }, fsCtx, deps())
    expect(ok).toBe(false)
  })

  it('proxy 源命中 → true', async () => {
    const ok = await evaluateSpec(
      { kind: 'mcp', names: ['headroom'], source: 'proxy' },
      ctx({ proxyParsed: { mcpServers: [{ name: 'headroom' }] } }),
      deps(),
    )
    expect(ok).toBe(true)
  })

  it('proxy 源 miss 而 fs 命中时 source=proxy → false（source 收窄）', async () => {
    const ok = await evaluateSpec(
      { kind: 'mcp', names: ['gitnexus'], source: 'proxy' },
      fsCtx,
      deps(),
    )
    expect(ok).toBe(false)
  })

  it('source=any 任一源命中 → true（含命名空间形态）', async () => {
    const ok = await evaluateSpec(
      { kind: 'mcp', names: ['context-mode', 'plugin_context-mode_context-mode'] },
      ctx({ proxyParsed: { mcpServers: [{ name: 'plugin_context-mode_context-mode' }] } }),
      deps(),
    )
    expect(ok).toBe(true)
  })

  it('两源都 miss → false', async () => {
    const ok = await evaluateSpec({ kind: 'mcp', names: ['none'] }, ctx(), deps())
    expect(ok).toBe(false)
  })
})

describe('evaluateSpec — plugin-enabled', () => {
  it('enabledPlugins[key] === true → true', async () => {
    const ok = await evaluateSpec(
      { kind: 'plugin-enabled', key: 'caveman@caveman' },
      ctx({ settingsJson: { enabledPlugins: { 'caveman@caveman': true } } }),
      deps(),
    )
    expect(ok).toBe(true)
  })

  it('key 缺失或非 true → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'plugin-enabled', key: 'caveman@caveman' },
      ctx({ settingsJson: { enabledPlugins: { 'caveman@caveman': false } } }),
      deps(),
    )
    expect(ok).toBe(false)
  })

  it('settingsJson 缺省 → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'plugin-enabled', key: 'caveman@caveman' },
      ctx(),
      deps(),
    )
    expect(ok).toBe(false)
  })
})

describe('evaluateSpec — proxy-plugin', () => {
  it('detectedPlugins 含 name → true', async () => {
    const ok = await evaluateSpec(
      { kind: 'proxy-plugin', name: 'ponytail' },
      ctx({ proxyParsed: { detectedPlugins: ['ponytail', 'i-have-adhd'] } }),
      deps(),
    )
    expect(ok).toBe(true)
  })

  it('detectedPlugins 不含 name → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'proxy-plugin', name: 'ponytail' },
      ctx({ proxyParsed: { detectedPlugins: ['i-have-adhd'] } }),
      deps(),
    )
    expect(ok).toBe(false)
  })

  it('proxyParsed 为 null → false', async () => {
    const ok = await evaluateSpec({ kind: 'proxy-plugin', name: 'ponytail' }, ctx(), deps())
    expect(ok).toBe(false)
  })
})

describe('evaluateSpec — hook', () => {
  const hookCtx = ctx({
    hookList: [{ event: 'PreToolUse', command: 'rtk proxy --agent codebuddy' }],
  })

  it('event 匹配且 command 含 match → true', async () => {
    const ok = await evaluateSpec(
      { kind: 'hook', event: 'PreToolUse', match: 'rtk' },
      hookCtx,
      deps(),
    )
    expect(ok).toBe(true)
  })

  it('command 不含 match → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'hook', event: 'PreToolUse', match: 'lean-ctx' },
      hookCtx,
      deps(),
    )
    expect(ok).toBe(false)
  })

  it('event 不匹配 → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'hook', event: 'PostToolUse', match: 'rtk' },
      hookCtx,
      deps(),
    )
    expect(ok).toBe(false)
  })

  it('command 缺失 → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'hook', event: 'PreToolUse', match: 'rtk' },
      ctx({ hookList: [{ event: 'PreToolUse' }] }),
      deps(),
    )
    expect(ok).toBe(false)
  })
})

describe('evaluateSpec — process', () => {
  it('listProcesses 返回命中行 → true', async () => {
    const lp = vi.fn().mockResolvedValue(['  123 headroom.cli proxy --port 8080'])
    const ok = await evaluateSpec(
      { kind: 'process', pattern: 'headroom' },
      ctx(),
      deps({ listProcesses: lp }),
    )
    expect(ok).toBe(true)
    expect(lp).toHaveBeenCalledWith('headroom')
  })

  it('无命中行 → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'process', pattern: 'headroom' },
      ctx(),
      deps({ listProcesses: async () => ['  123 other-agent serve'] }),
    )
    expect(ok).toBe(false)
  })

  it('双 lookahead pattern 逐行匹配（headroom 真实 pattern）', async () => {
    const pattern =
      '(?=.*(?:^|\\s)(?:python[0-9.\\s-]*\\s+-m\\s+)?headroom(?:\\.cli)?(?:\\s|$))(?=.*\\bproxy\\b)'
    const lp = async (p: string): Promise<string[]> => {
      const lines = [
        '  500 python3 -m headroom proxy --port 9000',
        '  501 headroom serve',
        '  502 myheadroom proxy',
      ]
      return lines.filter((l) => new RegExp(p).test(l))
    }
    const ok = await evaluateSpec({ kind: 'process', pattern }, ctx(), deps({ listProcesses: lp }))
    expect(ok).toBe(true)
  })

  it('双 lookahead pattern 不匹配（无 proxy 子命令）→ false', async () => {
    const pattern =
      '(?=.*(?:^|\\s)(?:python[0-9.\\s-]*\\s+-m\\s+)?headroom(?:\\.cli)?(?:\\s|$))(?=.*\\bproxy\\b)'
    const ok = await evaluateSpec(
      { kind: 'process', pattern },
      ctx(),
      deps({ listProcesses: async () => ['  501 headroom serve'] }),
    )
    expect(ok).toBe(false)
  })

  it('listProcesses 抛错 → false', async () => {
    const ok = await evaluateSpec(
      { kind: 'process', pattern: 'headroom' },
      ctx(),
      deps({ listProcesses: async () => { throw new Error('ps failed') } }),
    )
    expect(ok).toBe(false)
  })
})

describe('evaluateSpec — 组合器', () => {
  const ce = vi.fn()
    .mockResolvedValueOnce(true)   // all: 第一项 true
    .mockResolvedValueOnce(false)  // all: 第二项 false → 短路
    .mockResolvedValueOnce(false)  // any: 第一项 false
    .mockResolvedValueOnce(true)   // any: 第二项 true → 短路

  it('all 全真 → true，且短路（第三项不被求值）', async () => {
    const ok = await evaluateSpec(
      {
        all: [
          { kind: 'command', name: 'a' },
          { kind: 'command', name: 'b' },
          { kind: 'command', name: 'c' },
        ],
      },
      ctx(),
      deps({ commandExists: ce }),
    )
    expect(ok).toBe(false)
    expect(ce).toHaveBeenCalledTimes(2)
  })

  it('any 首真 → true，且短路', async () => {
    const ok = await evaluateSpec(
      {
        any: [
          { kind: 'command', name: 'x' },
          { kind: 'command', name: 'y' },
        ],
      },
      ctx(),
      deps({ commandExists: ce }),
    )
    expect(ok).toBe(true)
    expect(ce).toHaveBeenCalledTimes(4)
  })

  it('嵌套 all/any 组合 → true', async () => {
    const ok = await evaluateSpec(
      {
        all: [
          { kind: 'command', name: 'headroom' },
          {
            any: [
              { kind: 'mcp', names: ['headroom'] },
              { kind: 'process', pattern: 'headroom' },
            ],
          },
        ],
      },
      ctx({
        proxyParsed: { mcpServers: [{ name: 'headroom' }] },
      }),
      deps({
        commandExists: async () => true,
        listProcesses: async () => [],
      }),
    )
    expect(ok).toBe(true)
  })

  it('嵌套组合不满足 → false', async () => {
    const ok = await evaluateSpec(
      {
        all: [
          { kind: 'command', name: 'headroom' },
          { any: [{ kind: 'mcp', names: ['headroom'] }, { kind: 'process', pattern: 'headroom' }] },
        ],
      },
      ctx(),
      deps({
        commandExists: async () => true,
        listProcesses: async () => [],
      }),
    )
    expect(ok).toBe(false)
  })
})

describe('evaluateSpec — 防御', () => {
  it('未知 kind → throw', async () => {
    await expect(
      evaluateSpec({ kind: 'telepathy' } as never, ctx(), deps()),
    ).rejects.toThrow(/unknown kind/i)
  })
})
