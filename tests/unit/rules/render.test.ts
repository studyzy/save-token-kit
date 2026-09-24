import { describe, expect, it } from 'vitest'
import { loadRules } from '../../../src/rules/loader.js'
import { renderTemplate, renderHeader } from '../../../src/rules/render.js'

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

describe('renderHeader', () => {
  it('annotates the rules-pack version', () => {
    const merged = loadRules({ rulesHome: undefined as unknown as string })
    const header = renderHeader(merged)
    expect(header).toContain(`v${merged.rulesInfo.packVersion}`)
    expect(header).toMatch(/^<!-- stk-rules:/)
  })
})
