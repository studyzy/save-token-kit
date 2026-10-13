/**
 * Implement `stk diff [before] [after]`: compare two diagnosis reports and
 * write a structured Markdown delta to save-token/diff-report.md. Defaults
 * follow the stk-report SKILL convention: diagnosis-report.json (before) vs
 * diagnosis-report2.json (after).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bold, green, red } from 'ansis'
import { diffReports } from '../proxy/diff.js'
import { ensureIgnoredDir } from '../utils/fs-operations.js'
import { SAVE_TOKEN_DIR, type DiagnosisReport } from '../types/index.js'

export interface DiffOptions {
  before?: string
  after?: string
}

function readReport(path: string, label: string): DiagnosisReport {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`无法读取${label}报告: ${path}`)
  }
  const parsed = JSON.parse(raw) as DiagnosisReport
  if (!parsed || typeof parsed !== 'object' || !parsed.contextOverview) {
    throw new Error(`${path} 不是有效的 diagnosis-report.json（缺少 contextOverview）`)
  }
  return parsed
}

export async function runDiff(options: DiffOptions = {}): Promise<void> {
  const outDir = join(process.cwd(), SAVE_TOKEN_DIR)
  const beforePath = options.before ?? join(outDir, 'diagnosis-report.json')
  const afterPath = options.after ?? join(outDir, 'diagnosis-report2.json')

  let before: DiagnosisReport
  let after: DiagnosisReport
  try {
    before = readReport(beforePath, '优化前')
    after = readReport(afterPath, '优化后')
  } catch (err) {
    console.error(red((err as Error).message))
    process.exitCode = 1
    return
  }

  const markdown = diffReports(before, after)

  // Print to stdout (the report is compact), then persist for the SKILL flow.
  console.log(markdown)

  ensureIgnoredDir(outDir)
  const outPath = join(outDir, 'diff-report.md')
  writeFileSync(outPath, markdown)
  console.error(bold(green(`\n对比报告已写入 ${outPath}`)))
}
