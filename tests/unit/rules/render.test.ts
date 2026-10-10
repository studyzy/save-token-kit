import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadRules } from '../../../src/rules/loader.js'
import { renderTemplate, renderHeader, renderToolkitTables } from '../../../src/rules/render.js'
import type { MergedRules } from '../../../src/types/rules.js'

describe('renderTemplate', () => {
  it('replaces placeholders with pack fragments (library rules beat builtin)', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const skeleton = [
      'head',
      '<!-- stk:rules:prompts/tool-opt.codebuddy -->',
      '内置兜底内容',
      '<!-- /stk:rules:prompts/tool-opt.codebuddy -->',
      'tail',
    ].join('\n')
    const res = renderTemplate(skeleton, merged)
    expect(res.content).toContain('cblite` alias + `--tools "Defer(...)"`')
    expect(res.content).not.toContain('内置兜底内容')
    expect(res.content).toContain('head')
    expect(res.content).toContain('tail')
    expect(res.warnings).toHaveLength(0)
  })

  it('keeps builtin fallback when no pack provides the fragment', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const skeleton = [
      '<!-- stk:rules:prompts/unknown.frag -->',
      '兜底保留',
      '<!-- /stk:rules:prompts/unknown.frag -->',
    ].join('\n')
    const res = renderTemplate(skeleton, merged)
    expect(res.content).toContain('兜底保留')
  })

  it('keeps the placeholder pair and warns when fragment is missing everywhere', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const skeleton = [
      '<!-- stk:rules:prompts/never.frag -->',
      '<!-- /stk:rules:prompts/never.frag -->',
    ].join('\n')
    const res = renderTemplate(skeleton, merged)
    expect(res.content).toContain('stk:rules:prompts/never.frag')
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toContain('never.frag')
  })

  it('is byte-idempotent for identical inputs', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const skeleton = [
      '<!-- stk:rules:prompts/tool-opt.claude -->',
      'fallback',
      '<!-- /stk:rules:prompts/tool-opt.claude -->',
    ].join('\n')
    const a = renderTemplate(skeleton, merged).content
    const b = renderTemplate(skeleton, merged).content
    expect(a).toBe(b)
    expect(a).toContain('permissions.deny')
  })
})

describe('toolkit-meta rendering', () => {
  const toolkitSkeleton = (inner = '内置兜底表格', view = 'links') => [
    `<!-- stk:rules:toolkit-meta/${view} -->`,
    inner,
    `<!-- /stk:rules:toolkit-meta/${view} -->`,
  ].join('\n')

  it('replaces links placeholder with the official-repo table including rtk', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const res = renderTemplate(toolkitSkeleton(), merged)
    expect(res.content).toContain('| 工具 | 官方仓库 |')
    expect(res.content).toContain('| rtk | https://github.com/rtk-ai/rtk |')
    expect(res.content).not.toContain('内置兜底表格')
    expect(res.warnings).toHaveLength(0)
  })

  it('replaces agents placeholder with the per-agent support table', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const res = renderTemplate(toolkitSkeleton('内置兜底表格', 'agents'), merged)
    expect(res.content).toContain('| 工具 | claude | codex | codebuddy | 依据 |')
    expect(res.content).toContain('✗（特例，见过滤规则）') // rtk codebuddy
    expect(res.content).toContain('✓（注入类）') // karpathy-skills codebuddy
    expect(res.content).not.toContain('内置兜底表格')
  })

  it('exclude filter removes rows for the listed ids', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const skeleton = [
      '<!-- stk:rules:toolkit-meta/links exclude=graphify,codebase-memory,codegraph,gitnexus -->',
      '兜底',
      '<!-- /stk:rules:toolkit-meta/links exclude=graphify,codebase-memory,codegraph,gitnexus -->',
    ].join('\n')
    const res = renderTemplate(skeleton, merged)
    expect(res.content).toContain('| 工具 | 官方仓库 |')
    for (const id of ['graphify', 'codebase-memory', 'codegraph', 'gitnexus']) {
      expect(res.content).not.toContain(`| ${id} |`)
    }
  })

  it('only filter keeps just the listed subset', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const skeleton = [
      '<!-- stk:rules:toolkit-meta/links only=rtk,graphify -->',
      '兜底',
      '<!-- /stk:rules:toolkit-meta/links only=rtk,graphify -->',
    ].join('\n')
    const res = renderTemplate(skeleton, merged)
    expect(res.content).toContain('| rtk | https://github.com/rtk-ai/rtk |')
    expect(res.content).toContain('| graphify |')
    expect(res.content).not.toContain('| caveman |')
  })

  it('keeps builtin fallback when no entry carries meta after filtering', () => {
    const merged = {
      ...loadRules({ rulesHome: undefined as unknown as string }),
      toolkits: {},
    } as MergedRules
    const res = renderTemplate(toolkitSkeleton(), merged)
    expect(res.content).toContain('内置兜底表格')
    expect(res.warnings).toHaveLength(0)
  })

  it('keeps the placeholder pair and warns when fallback is empty and no meta exists', () => {
    const merged = {
      ...loadRules({ rulesHome: undefined as unknown as string }),
      toolkits: {},
    } as MergedRules
    const res = renderTemplate(toolkitSkeleton(''), merged)
    expect(res.content).toContain('stk:rules:toolkit-meta/links')
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toBe('toolkit-meta links 无可用 meta 数据且骨架无兜底内容')
  })

  it('omits the marker from output and is byte-idempotent', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const skeleton = [
      toolkitSkeleton(),
      toolkitSkeleton('兜底', 'agents'),
    ].join('\n')
    const res = renderTemplate(skeleton, merged)
    expect(res.content).not.toContain('stk:rules:toolkit-meta')
    expect(renderTemplate(skeleton, merged).content).toBe(res.content)
  })

  it('renderToolkitTables direct call matches renderTemplate output', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const direct = renderToolkitTables(merged, 'links')
    const res = renderTemplate(toolkitSkeleton(), merged)
    expect(res.content).toContain(`${direct}\n`)
  })

  it('levels view renders the level table and omits entries without level', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const res = renderTemplate(toolkitSkeleton('内置兜底表格', 'levels'), merged)
    expect(res.content).toContain('| 工具 | level |')
    expect(res.content).toContain('| rtk | 初级 |')
    expect(res.content).toContain('| caveman | 中级 |')
    expect(res.content).toContain('| headroom | 高级 |')
    expect(res.content).toContain('| ponytail | 中级 |')
    for (const id of ['graphify', 'codebase-memory', 'codegraph', 'gitnexus']) {
      expect(res.content).not.toContain(`| ${id} |`)
    }
    expect(res.content).not.toContain('内置兜底表格')
    expect(res.warnings).toHaveLength(0)
  })

  it('est view renders the token estimate table and omits entries without estTokens', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const res = renderTemplate(toolkitSkeleton('内置兜底表格', 'est'), merged)
    expect(res.content).toContain('| 工具 | 默认估算 (tokens) |')
    expect(res.content).toContain('| rtk | 50000 |')
    expect(res.content).toContain('| i-have-adhd | 10000 |')
    expect(res.content).not.toContain('| ponytail |')
    expect(res.content).not.toContain('内置兜底表格')
  })

  it('names view with category filter outputs a plain name list in insertion order', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const skeleton = [
      '<!-- stk:rules:toolkit-meta/names category=knowledge-base -->',
      '内置兜底名单',
      '<!-- /stk:rules:toolkit-meta/names category=knowledge-base -->',
    ].join('\n')
    const res = renderTemplate(skeleton, merged)
    expect(res.content).toContain('graphify, gitnexus, codebase-memory, codegraph')
    expect(res.content).not.toContain('| 工具 |')
    expect(res.content).not.toContain('内置兜底名单')
  })

  it('exclude-category filter and only/exclude are orthogonal and stackable', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const skeleton = [
      '<!-- stk:rules:toolkit-meta/links exclude-category=knowledge-base -->',
      '兜底',
      '<!-- /stk:rules:toolkit-meta/links exclude-category=knowledge-base -->',
    ].join('\n')
    const res = renderTemplate(skeleton, merged)
    expect(res.content).toContain('| rtk | https://github.com/rtk-ai/rtk |')
    for (const id of ['graphify', 'codebase-memory', 'codegraph', 'gitnexus']) {
      expect(res.content).not.toContain(`| ${id} |`)
    }

    const stack = [
      '<!-- stk:rules:toolkit-meta/names category=knowledge-base only=graphify,rtk -->',
      '兜底',
      '<!-- /stk:rules:toolkit-meta/names category=knowledge-base only=graphify,rtk -->',
    ].join('\n')
    const res2 = renderTemplate(stack, merged)
    expect(res2.content).toContain('graphify')
    expect(res2.content).not.toContain('gitnexus')
  })

  it('keeps fallback when filtering yields zero entries with data, warns on empty fallback', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    // graphify 无 level → only=graphify 过滤后零项 → 保留兜底骨架
    const zero = [
      '<!-- stk:rules:toolkit-meta/levels only=graphify -->',
      '兜底表格',
      '<!-- /stk:rules:toolkit-meta/levels only=graphify -->',
    ].join('\n')
    const res = renderTemplate(zero, merged)
    expect(res.content).toContain('兜底表格')
    expect(res.warnings).toHaveLength(0)

    const empty = [
      '<!-- stk:rules:toolkit-meta/levels only=graphify -->',
      '<!-- /stk:rules:toolkit-meta/levels only=graphify -->',
    ].join('\n')
    const res2 = renderTemplate(empty, merged)
    expect(res2.content).toContain('stk:rules:toolkit-meta/levels')
    expect(res2.warnings).toEqual(['toolkit-meta levels 无可用 meta 数据且骨架无兜底内容'])
  })

  it('new views are idempotent and leave no placeholder markers', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const parts = [
      toolkitSkeleton('兜底', 'levels'),
      toolkitSkeleton('兜底', 'est'),
      toolkitSkeleton('兜底', 'names'),
    ].join('\n')
    const res = renderTemplate(parts, merged)
    expect(res.content).not.toContain('stk:rules:toolkit-meta')
    expect(renderTemplate(parts, merged).content).toBe(res.content)
  })
})

describe('smoke: real agent templates render without placeholder residue', () => {
  const merged = loadRules({ rulesHome: undefined as unknown as string })
  const loadTemplate = (name: string) =>
    readFileSync(
      fileURLToPath(new URL(`../../../src/templates/skills/stk-analyze/agents/${name}.md`, import.meta.url)),
      'utf8',
    )

  it('smoke: toolkit-enable/knowledge-base 模板渲染后无占位标记且含真实 meta 表', () => {
    const enable = renderTemplate(loadTemplate('toolkit-enable'), merged)
    expect(enable.content).not.toContain('stk:rules:toolkit-meta')
    expect(enable.content).toContain('https://github.com/rtk-ai/rtk')
    expect(enable.content).toContain('| 工具 | 官方仓库 |')
    expect(enable.content).toContain('| 工具 | claude | codex | codebuddy | 依据 |')
    expect(enable.warnings).toHaveLength(0)

    const kb = renderTemplate(loadTemplate('knowledge-base'), merged)
    expect(kb.content).not.toContain('stk:rules:toolkit-meta')
    expect(kb.content).toContain('https://github.com/Graphify-Labs/graphify')
    expect(kb.content).toContain('https://github.com/abhigyanpatwari/GitNexus')
    expect(kb.warnings).toHaveLength(0)
  })
})

describe('renderHeader', () => {
  it('annotates the rules-pack version', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const header = renderHeader(merged)
    expect(header).toContain(`v${merged.rulesInfo.packVersion}`)
    expect(header).toMatch(/^<!-- stk-rules:/)
  })
})
