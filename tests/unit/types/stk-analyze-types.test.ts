import { describe, it, expect, expectTypeOf } from 'vitest'
import type { OperationType, AnalysisSuggestion, RepoScan } from '../../../src/types/index.js'

describe('stk-analyze types (002-rebuild)', () => {
  describe('OperationType extensions', () => {
    it('includes defer-tools and knowledge-base alongside existing values', () => {
      const values: OperationType[] = [
        'disable-skill',
        'disable-mcp',
        'defer-mcp',
        'replace-mcp-with-cli',
        'trim-codebuddy-md',
        'trim-file',
        'install-toolkit',
        'other',
        'defer-tools',
        'knowledge-base',
      ]
      expect(values.length).toBe(10)
    })

    it('does NOT include mcp-defer (removed as redundant)', () => {
      const bad: OperationType = 'mcp-defer'
      // @ts-expect-error mcp-defer is not a valid OperationType
      expectTypeOf(bad).toEqualTypeOf<string>()
    })
  })

  describe('AnalysisSuggestion extensions', () => {
    it('allows optional scenario and evidence fields', () => {
      const s: AnalysisSuggestion = {
        id: 'S1',
        title: '启用 Headroom',
        detail: '已安装未启用',
        operationType: 'install-toolkit',
        target: 'headroom',
        estimatedSavingTokens: 0,
        risk: 'low',
        reversible: true,
        scenario: 'code',
        evidence: 'toolkitDetection: installed=true, enabled=false',
      }
      expect(s.scenario).toBe('code')
      expect(s.evidence).toContain('toolkitDetection')
    })

    it('works without scenario/evidence (backward compatible)', () => {
      const s: AnalysisSuggestion = {
        id: 'S1',
        title: 't',
        detail: 'd',
        operationType: 'other',
        estimatedSavingTokens: 0,
        risk: 'low',
        reversible: true,
      }
      expect(s.scenario).toBeUndefined()
      expect(s.evidence).toBeUndefined()
    })
  })

  describe('RepoScan', () => {
    it('has required fields per repo-scan contract', () => {
      const r: RepoScan = {
        scannedAt: '2026-07-13T10:00:00Z',
        codeFileCount: 42,
        docFileCount: 8,
        codeLineCount: 5800,
        docLineCount: 1200,
        topLanguages: ['TypeScript', 'JavaScript', 'Python'],
        hasDocsDir: true,
        hasMemoryMd: true,
        memoryMd: 'CODEBUDDY.md',
        isMonorepo: false,
        scanError: null,
      }
      expect(r.topLanguages.length).toBeLessThanOrEqual(3)
      expect(r.codeFileCount).toBeGreaterThanOrEqual(0)
    })
  })

  // AnalysisContext removed from the type contract — scenario is now inferred
  // from repo-scan.json / usageStats instead of user questioning.
})
