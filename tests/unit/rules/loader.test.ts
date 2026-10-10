import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRules } from '../../../src/rules/loader.js'
import fallbackPack from '../../../src/rules/fallback.json'

const FX = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

describe('loadRules builtin layer', () => {
  it('loads the bundled single file when no library is installed', () => {
    const merged = loadRules({ rulesFile: FX('empty-home') + '/none.json' })
    expect(merged.rulesInfo.packVersion).toBe((fallbackPack as { packVersion: string }).packVersion)
    expect(merged.rulesInfo.fallbackInUse).toBe(true)
    expect(merged.lowFrequencyPlugins.has('pptx@codebuddy-plugins-official')).toBe(true)
    expect(merged.mcpAlternatives['github-mcp']).toBe('gh')
    expect(merged.thresholds['memoryMdMaxLines']).toBe(150)
    expect(merged.levels['*']).toBe('中级')
    // prompts flow from the bundled single file
    expect(merged.prompts['tool-opt.codebuddy']).toContain('cblite')
  })
})

describe('loadRules library layer (single file)', () => {
  it('adopts a valid installed file and applies its overrides', () => {
    const merged = loadRules({ rulesFile: FX('valid-pack') + '/stk-rules.json' })
    expect(merged.rulesInfo.packVersion).toBe('1.1.0')
    expect(merged.rulesInfo.fallbackInUse).toBe(false)
    expect(merged.mcpAlternatives['github']).toBe('my-cli')
    expect(merged.thresholds['memoryMdMaxLines']).toBe(120)
    expect(merged.levels['headroom']).toBe('初级')
    expect(merged.lowFrequencyPlugins.has('extra-lowfreq-plugin')).toBe(true)
    expect(merged.mcpAlternatives['notion']).toBe('notion-cli')
  })

  it('rejects unknown schemaVersion', () => {
    const merged = loadRules({ rulesFile: FX('high-schema') + '/stk-rules.json' })
    expect(merged.rulesInfo.fallbackInUse).toBe(true)
    expect(merged.rulesInfo.sources.find((s) => s.layer === 'library')?.result).toBe('rejected-incompatible')
  })

  it('rejects engines range excluding the engine version', () => {
    const merged = loadRules({ rulesFile: FX('incompatible') + '/stk-rules.json' })
    expect(merged.rulesInfo.fallbackInUse).toBe(true)
    expect(merged.rulesInfo.sources.find((s) => s.layer === 'library')?.result).toBe('rejected-incompatible')
  })

  it('rejects corrupted JSON', () => {
    const merged = loadRules({ rulesFile: FX('corrupted-manifest') + '/stk-rules.json' })
    expect(merged.rulesInfo.sources.find((s) => s.layer === 'library')?.result).toBe('rejected-corrupted')
  })

  it('rejects invalid data shapes entirely (no partial load)', () => {
    const merged = loadRules({ rulesFile: FX('corrupted-data') + '/stk-rules.json' })
    expect(merged.rulesInfo.sources.find((s) => s.layer === 'library')?.result).toBe('rejected-corrupted')
    expect(merged.rulesInfo.fallbackInUse).toBe(true)
  })
})

describe('loadRules user layer toolkit meta validation', () => {
  const tmpLayers: string[] = []

  function userLayerWith(toolkits: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 'stk-rules-'))
    tmpLayers.push(dir)
    writeFileSync(join(dir, 'toolkits.json'), JSON.stringify(toolkits))
    return dir
  }

  function userSource(merged: ReturnType<typeof loadRules>) {
    return merged.rulesInfo.sources.find((s) => s.layer === 'user')
  }

  it('accepts full meta fields (repo/agents/agentNotes/agentNote/install)', () => {
    const merged = loadRules({
      userDir: userLayerWith([
        {
          id: 'gh',
          type: 'cli',
          repo: 'owner/gh',
          agents: { claude: true, codex: false, codebuddy: true },
          agentNotes: { claude: 'note-a', codex: 'note-b', codebuddy: 'note-c' },
          agentNote: 'misc note',
          install: { default: 'npm i -g gh', byAgent: { claude: 'brew install gh' } },
        },
      ]),
    })
    expect(userSource(merged)?.result).toBe('ok')
  })

  it('rejects invalid agents keys with field-scoped message', () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })
    try {
      const merged = loadRules({
        userDir: userLayerWith([{ id: 'gh', type: 'cli', agents: { workbuddy: true } }]),
      })
      expect(userSource(merged)?.result).toBe('rejected-corrupted')
      expect(writes.join()).toContain('toolkits[gh].agents')
    } finally {
      spy.mockRestore()
    }
  })

  it('rejects agents values that are not booleans', () => {
    const merged = loadRules({
      userDir: userLayerWith([{ id: 'gh', type: 'cli', agents: { claude: 'yes' } }]),
    })
    expect(userSource(merged)?.result).toBe('rejected-corrupted')
  })

  it('rejects agentNotes values that are not strings', () => {
    const merged = loadRules({
      userDir: userLayerWith([{ id: 'gh', type: 'cli', agentNotes: { claude: 42 } }]),
    })
    expect(userSource(merged)?.result).toBe('rejected-corrupted')
  })

  it('rejects install.byAgent values that are not strings', () => {
    const merged = loadRules({
      userDir: userLayerWith([{ id: 'gh', type: 'cli', install: { byAgent: { claude: true } } }]),
    })
    expect(userSource(merged)?.result).toBe('rejected-corrupted')
  })

  it('accepts legacy entries without meta fields', () => {
    const merged = loadRules({ userDir: userLayerWith([{ id: 'gh', type: 'cli' }]) })
    expect(userSource(merged)?.result).toBe('ok')
  })

  it('accepts unknown meta fields (loose semantics)', () => {
    const merged = loadRules({
      userDir: userLayerWith([{ id: 'gh', type: 'cli', foo: 'bar' }]),
    })
    expect(userSource(merged)?.result).toBe('ok')
  })
})

describe('loadRules user layer toolkit spec validation (detect/enabled)', () => {
  const tmpLayers: string[] = []

  function userLayerWith(toolkits: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 'stk-rules-'))
    tmpLayers.push(dir)
    writeFileSync(join(dir, 'toolkits.json'), JSON.stringify(toolkits))
    return dir
  }

  function userSource(merged: ReturnType<typeof loadRules>) {
    return merged.rulesInfo.sources.find((s) => s.layer === 'user')
  }

  function stderrCapture(): { writes: string[]; spy: ReturnType<typeof vi.spyOn> } {
    const writes: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })
    return { writes, spy }
  }

  function expectRejected(toolkits: unknown, messagePart?: string): string[] {
    const { writes, spy } = stderrCapture()
    try {
      const merged = loadRules({ userDir: userLayerWith(toolkits) })
      expect(userSource(merged)?.result).toBe('rejected-corrupted')
      if (messagePart) expect(writes.join()).toContain(messagePart)
      return writes
    } finally {
      spy.mockRestore()
    }
  }

  const kindSamples: Array<[string, Record<string, unknown>]> = [
    ['command', { kind: 'command', name: 'rtk' }],
    ['path', { kind: 'path', path: '~/.foo' }],
    ['mcp', { kind: 'mcp', names: ['a'] }],
    ['plugin-enabled', { kind: 'plugin-enabled', key: 'x' }],
    ['proxy-plugin', { kind: 'proxy-plugin', name: 'x' }],
    ['hook', { kind: 'hook', event: 'PreToolUse', match: 'rtk' }],
    ['process', { kind: 'process', pattern: 'foo' }],
  ]

  it('accepts valid specs of every kind on both detect and enabled', () => {
    for (const [label, detect] of kindSamples) {
      const merged = loadRules({
        userDir: userLayerWith([{ id: label, type: 'cli', detect, enabled: detect }]),
      })
      expect(userSource(merged)?.result, label).toBe('ok')
    }
  })

  it('accepts all/any nesting up to 3 levels', () => {
    const spec = {
      any: [
        { kind: 'command', name: 'a' },
        { all: [{ kind: 'command', name: 'b' }, { any: [{ kind: 'mcp', names: ['c'] }] }] },
      ],
    }
    const merged = loadRules({
      userDir: userLayerWith([{ id: 'x', type: 'cli', detect: spec }]),
    })
    expect(userSource(merged)?.result).toBe('ok')
  })

  it('rejects unknown kind with field-scoped message', () => {
    expectRejected([{ id: 'gh', type: 'cli', detect: { kind: 'nope' } }], 'toolkits[gh].detect')
  })

  it('rejects missing required params per kind', () => {
    const cases: Array<Record<string, unknown>> = [
      { kind: 'command' },
      { kind: 'path' },
      { kind: 'mcp' },
      { kind: 'plugin-enabled' },
      { kind: 'proxy-plugin' },
      { kind: 'hook', event: 'PreToolUse' },
      { kind: 'hook', match: 'rtk' },
      { kind: 'process' },
    ]
    for (const detect of cases) {
      expectRejected([{ id: 'gh', type: 'cli', detect }])
    }
  })

  it('rejects wrongly-typed params (names not string array, name not string)', () => {
    expectRejected([{ id: 'gh', type: 'cli', detect: { kind: 'mcp', names: 'a' } }])
    expectRejected([{ id: 'gh', type: 'cli', detect: { kind: 'command', name: 42 } }])
  })

  it('rejects combinator nesting deeper than 3 levels', () => {
    const spec = { all: [{ all: [{ all: [{ all: [{ kind: 'command', name: 'a' }] }] }] }] }
    const merged = loadRules({ userDir: userLayerWith([{ id: 'gh', type: 'cli', detect: spec }]) })
    expect(userSource(merged)?.result).toBe('rejected-corrupted')
  })

  it('rejects install.handler / install.verify that are not strings', () => {
    expectRejected([{ id: 'gh', type: 'cli', install: { handler: 42 } }])
    expectRejected([{ id: 'gh', type: 'cli', install: { verify: true } }])
  })

  it('rejects invalid level and estTokens', () => {
    expectRejected([{ id: 'gh', type: 'cli', level: ' beginner ' }])
    expectRejected([{ id: 'gh', type: 'cli', estTokens: -1 }])
    expectRejected([{ id: 'gh', type: 'cli', estTokens: 1.5 }])
  })

  it('accepts legacy entries without spec fields and unknown spec fields', () => {
    const merged = loadRules({
      userDir: userLayerWith([
        { id: 'legacy', type: 'cli' },
        { id: 'x', type: 'cli', detect: { kind: 'command', name: 'a', bogus: 1 } },
      ]),
    })
    expect(userSource(merged)?.result).toBe('ok')
  })

  it('validates enabled with field-scoped message', () => {
    expectRejected([{ id: 'gh', type: 'cli', enabled: { kind: 'nope' } }], 'toolkits[gh].enabled')
  })
})
