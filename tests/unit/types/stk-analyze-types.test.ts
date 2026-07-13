import { describe, it, expect, assertType, expectTypeOf } from 'vitest'
import type {
  OperationType,
  AnalysisSuggestion,
  RepoScan,
  AnalysisContext,
} from '../../../src/types/index.js'

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
        'install-tool',
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
        operationType: 'install-tool',
        target: 'headroom',
        estimatedSavingTokens: 0,
        risk: 'low',
        reversible: true,
        scenario: 'code',
        evidence: 'toolDetection: installed=true, enabled=false',
      }
      expect(s.scenario).toBe('code')
      expect(s.evidence).toContain('toolDetection')
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
        hasCodebuddyMd: true,
        isMonorepo: false,
        scanError: null,
      }
      expect(r.topLanguages.length).toBeLessThanOrEqual(3)
      expect(r.codeFileCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe('AnalysisContext', () => {
    it('carries purpose, sameRepo and optional graphTool', () => {
      const c: AnalysisContext = {
        collectedAt: '2026-07-13T10:00:00Z',
        purpose: 'code',
        sameRepo: 'same',
        graphTool: 'graphify',
      }
      expect(c.graphTool).toBe('graphify')
    })

    it('allows graphTool undefined when repo too small to ask', () => {
      const c: AnalysisContext = {
        collectedAt: '2026-07-13T10:00:00Z',
        purpose: 'code',
        sameRepo: 'same',
      }
      expect(c.graphTool).toBeUndefined()
    })

    it('accepts codegraph/gitnexus kebab storage values', () => {
      assertType<AnalysisContext['graphTool']>('codegraph')
      assertType<AnalysisContext['graphTool']>('gitnexus')
    })
  })
})
