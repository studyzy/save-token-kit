import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILL = readFileSync(
  resolve(__dirname, '../../../src/templates/skills/stk-analyze/SKILL.md'),
  'utf-8',
)

const skillSections = () => {
  const m = SKILL.match(/^#{2,3} .+$/gm) ?? []
  return m.map((s) => s.replace(/^#{2,3} /, '').trim())
}

describe('stk-analyze SKILL.md structure (002-rebuild)', () => {
  describe('T009: four-phase structure', () => {
    const sections = skillSections()
    it('has phase: context & scenario collection', () => {
      expect(sections.some((s) => s.includes('上下文') && s.includes('场景'))).toBe(true)
    })
    it('has phase: repo code/doc collection', () => {
      expect(sections.some((s) => s.includes('仓库') && s.includes('采集'))).toBe(true)
    })
    it('has phase: parallel sub-agent dispatch', () => {
      expect(sections.some((s) => s.includes('子 Agent') && s.includes('派发'))).toBe(true)
    })
    it('has phase: aggregate tasks.md', () => {
      expect(sections.some((s) => s.includes('汇总') && s.includes('tasks.md'))).toBe(true)
    })
  })

  describe('T010/T029: eleven sub-agents with existence-based start conditions', () => {
    const agents = [
      'tool-enable',
      'mcp-opt',
      'plugin-opt',
      'agent-opt',
      'skill-opt',
      'knowledge-base',
      'command-opt',
      'rules-opt',
      'memory-md',
      'hook-audit',
      'tool-opt',
    ]
    it('defines all 11 sub-agents', () => {
      for (const a of agents) {
        expect(SKILL, `missing sub-agent: ${a}`).toContain(a)
      }
    })
    it('each sub-agent start condition references a diagnostic object existence', () => {
      // FR-4 table rows must express "array non-empty" style conditions
      expect(SKILL).toMatch(/启动条件/)
      expect(SKILL).toMatch(/非空/)
      expect(SKILL).toMatch(/mcpList\[\]/)
    })
  })

  describe('T011: one-task-per-unit principle preserved', () => {
    it('retains the "一个 SKILL 一个 Task" rule in tasks.md format section', () => {
      expect(SKILL).toContain('一个 SKILL 一个 Task')
      expect(SKILL).toContain('一个工具一个 Task')
      expect(SKILL).toContain('一个 MCP 一个 Task')
    })
  })

  describe('T017: repo scan step with repo-scan.json fields', () => {
    it('references repo-scan.json and its key fields', () => {
      expect(SKILL).toContain('repo-scan.json')
      for (const f of [
        'codeFileCount',
        'docFileCount',
        'topLanguages',
        'hasMemoryMd',
        'memoryMd',
        'isMonorepo',
      ]) {
        expect(SKILL, `missing repo field: ${f}`).toContain(f)
      }
    })
  })

  describe('T018: knowledge-graph tool preference question', () => {
    it('lists the four graph tools plus "暂不需要" with recommendation marker', () => {
      for (const t of [
        'Graphify',
        'Codebase-Memory MCP',
        'CodeGraph',
        'GitNexus',
        '暂不需要',
        '推荐',
      ]) {
        expect(SKILL, `missing graph tool option: ${t}`).toContain(t)
      }
    })
  })

  describe('T025: unified schema matches suggestion-file contract', () => {
    it('defines unified schema with required top-level fields', () => {
      for (const f of ['agentName', 'category', 'generatedAt', 'skipped', 'suggestions']) {
        expect(SKILL, `missing schema field: ${f}`).toContain(f)
      }
    })
    it('documents defer-mcp semantics as defer_loading:true', () => {
      expect(SKILL).toContain('defer_loading')
    })
  })

  describe('T030: sub-agent table reconciles with data-model mapping', () => {
    it('FR-4 table lists 8 agent rows', () => {
      const rows = SKILL.match(/^\| .* \| .* \| .* \|$/gm) ?? []
      // at least the 8 sub-agent definition rows present in the start-condition table
      const fr4 = SKILL.split('启动条件表')[1] ?? ''
      expect(fr4).toContain('tool-enable')
      expect(fr4).toContain('hook-audit')
      expect(rows.length).toBeGreaterThanOrEqual(8)
    })
  })

  describe('T031: sub-agent self-verify with stk verify (programmatic format check)', () => {
    it('requires sub-agent to write and self-verify its own file via stk verify --file', () => {
      expect(SKILL).toContain('stk verify --file')
      expect(SKILL).toContain('suggestions-<agent-name>.json')
    })
    it('defines finite retry (overwrite + re-verify, capped) rather than infinite loop', () => {
      expect(SKILL).toMatch(/连续.*3 次|有限重试|不再无限重试/)
      expect(SKILL).toContain('覆盖重写')
    })
    it('explains format validation belongs to the program, not LLM re-read self-check', () => {
      expect(SKILL).toMatch(/死逻辑|程序化/)
    })
  })

  describe('T032: explicit state machine', () => {
    it('defines PENDING/READY/RUNNING/SUCCESS/FAILED/RETRYING states', () => {
      for (const s of ['PENDING', 'READY', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING']) {
        expect(SKILL, `missing state: ${s}`).toContain(s)
      }
    })
  })
})
