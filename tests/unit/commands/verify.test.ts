import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  validateSuggestionObject,
  validateSuggestionFile,
  validateAllSaveToken,
} from '@/commands/verify.js'

/** A minimal valid suggestion file object. */
function validDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    agentName: 'tool-enable',
    category: '第三方工具启用',
    generatedAt: '2026-08-14T00:00:00Z',
    skipped: false,
    suggestions: [
      {
        id: 'S1',
        title: '启用 RTK',
        detail: 'rtk 已安装未启用',
        operationType: 'install-tool',
        target: 'rtk',
        estimatedSavingTokens: 50000,
        risk: 'low',
        reversible: true,
        scenario: 'code',
        level: '初级',
        evidence: 'installed=true',
      },
    ],
    ...overrides,
  }
}

describe('stk verify: validateSuggestionObject (pure)', () => {
  it('accepts a fully valid document', () => {
    const { errors } = validateSuggestionObject(validDoc(), null)
    expect(errors).toHaveLength(0)
  })

  it('rejects non-object top level', () => {
    expect(validateSuggestionObject('nope', null).errors).toContain('顶层必须是 JSON 对象')
    expect(validateSuggestionObject(null, null).errors).toContain('顶层必须是 JSON 对象')
  })

  it('rejects when top-level fields are missing', () => {
    const { errors } = validateSuggestionObject({ suggestions: [] }, null)
    expect(errors).toContain('缺少顶层字段: agentName')
    expect(errors).toContain('缺少顶层字段: category')
    expect(errors).toContain('缺少顶层字段: generatedAt')
    expect(errors).toContain('缺少顶层字段: skipped')
  })

  it('rejects when suggestions is not an array', () => {
    const { errors } = validateSuggestionObject(validDoc({ suggestions: 'x' }), null)
    expect(errors).toContain('suggestions 必须是数组')
  })

  it('flags mismatched agentName vs filename', () => {
    const { errors } = validateSuggestionObject(validDoc(), 'suggestions-tool-enable.json')
    expect(errors).toHaveLength(0)
    const bad = validateSuggestionObject(validDoc({ agentName: 'mcp-opt' }), 'suggestions-tool-enable.json')
    expect(bad.errors.some((e) => e.includes('不匹配'))).toBe(true)
  })

  it('flags missing per-suggestion required fields', () => {
    const doc = validDoc({
      suggestions: [{ id: 'S1', title: 'x' }],
    })
    const { errors } = validateSuggestionObject(doc, null)
    expect(errors).toContain('suggestions[0].detail: 缺少必填字段')
    expect(errors).toContain('suggestions[0].operationType: 缺少必填字段')
    expect(errors).toContain('suggestions[0].target: 缺少必填字段')
    expect(errors).toContain('suggestions[0].level: 缺少必填字段')
  })

  it('rejects invalid operationType', () => {
    const { errors } = validateSuggestionObject(
      validDoc({ suggestions: [{ ...validDoc().suggestions[0], operationType: 'nope' }] }),
      null,
    )
    expect(errors.some((e) => e.includes('operationType') && e.includes('nope'))).toBe(true)
  })

  it('rejects invalid risk', () => {
    const { errors } = validateSuggestionObject(
      validDoc({ suggestions: [{ ...validDoc().suggestions[0], risk: 'very-high' }] }),
      null,
    )
    expect(errors.some((e) => e.includes('risk') && e.includes('very-high'))).toBe(true)
  })

  it('rejects invalid level', () => {
    const { errors } = validateSuggestionObject(
      validDoc({ suggestions: [{ ...validDoc().suggestions[0], level: '大师级' }] }),
      null,
    )
    expect(errors.some((e) => e.includes('level') && e.includes('大师级'))).toBe(true)
  })

  it('rejects negative estimatedSavingTokens', () => {
    const { errors } = validateSuggestionObject(
      validDoc({ suggestions: [{ ...validDoc().suggestions[0], estimatedSavingTokens: -1 }] }),
      null,
    )
    expect(errors.some((e) => e.includes('estimatedSavingTokens'))).toBe(true)
  })

  it('rejects empty target and non-boolean reversible', () => {
    const { errors } = validateSuggestionObject(
      validDoc({
        suggestions: [{ ...validDoc().suggestions[0], target: '  ', reversible: 'yes' }],
      }),
      null,
    )
    expect(errors.some((e) => e.includes('target'))).toBe(true)
    expect(errors.some((e) => e.includes('reversible'))).toBe(true)
  })
})

describe('stk verify: file-level', () => {
  let tmp: string
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('validateSuggestionFile returns invalid on broken JSON', () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-verify-'))
    const f = join(tmp, 'suggestions-a.json')
    writeFileSync(f, '{ not json')
    const r = validateSuggestionFile(f, 'suggestions-a.json')
    expect(r.valid).toBe(false)
    expect(r.errors[0].line).toContain('JSON 解析失败')
  })

  it('validateAllSaveToken flags missing dir', () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-verify-'))
    const prev = process.cwd()
    process.chdir(tmp)
    try {
      const r = validateAllSaveToken()
      expect(r[0].valid).toBe(false)
      expect(r[0].errors[0].line).toContain('目录不存在')
    } finally {
      process.chdir(prev)
    }
  })

  it('validateAllSaveToken reports no files found when dir empty', () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-verify-'))
    mkdirSync(join(tmp, 'save-token'))
    const prev = process.cwd()
    process.chdir(tmp)
    try {
      const r = validateAllSaveToken()
      expect(r[0].valid).toBe(false)
      expect(r[0].errors[0].line).toContain('未找到')
    } finally {
      process.chdir(prev)
    }
  })

  it('validateAllSaveToken validates every suggestions-*.json and repo-analysis.json', () => {
    tmp = mkdtempSync(join(tmpdir(), 'stk-verify-'))
    mkdirSync(join(tmp, 'save-token'))
    writeFileSync(
      join(tmp, 'save-token', 'suggestions-a.json'),
      JSON.stringify(validDoc({ agentName: 'a' })),
    )
    writeFileSync(
      join(tmp, 'save-token', 'repo-analysis.json'),
      JSON.stringify(validDoc({ agentName: 'repo-analysis' })),
    )
    // Non-target file should be ignored
    writeFileSync(join(tmp, 'save-token', 'tasks.md'), '# tasks')
    const prev = process.cwd()
    process.chdir(tmp)
    try {
      const results = validateAllSaveToken()
      expect(results).toHaveLength(2)
      expect(results.every((r) => r.valid)).toBe(true)
      expect(existsSync(join(tmp, 'save-token', 'tasks.md'))).toBe(true) // untouched
    } finally {
      process.chdir(prev)
    }
  })
})
