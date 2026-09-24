import { homedir } from 'node:os'
import { join } from 'node:path'
import type { MergedRules } from '../types/rules.js'

const PAIR_RE = /<!-- stk:rules:prompts\/([\w.-]+) -->\n([\s\S]*?)<!-- \/stk:rules:prompts\/\1 -->/g

export interface RenderResult {
  content: string
  warnings: string[]
}

/**
 * Render a template skeleton by replacing prompt-fragment placeholders with
 * the highest-priority fragment from the merged rules (project > user >
 * library > builtin). One-shot at `stk init` time; idempotent for the same
 * inputs (contracts/prompt-render.md).
 */
export function renderTemplate(skeleton: string, merged: MergedRules): RenderResult {
  const warnings: string[] = []
  const content = skeleton.replace(PAIR_RE, (whole, name: string, fallback: string) => {
    const frag = merged.prompts[name]
    if (typeof frag === 'string' && frag.length > 0) {
      // trailing newline normalization keeps replacements stable
      return frag.endsWith('\n') ? frag : `${frag}\n`
    }
    if (fallback.trim().length === 0) {
      warnings.push(`提示词片段 ${name} 在规则库与骨架中均不存在`)
      return whole // keep the placeholder pair visible for inspection
    }
    return fallback
  })
  return { content, warnings }
}

/** Version header comment inserted at the top of rendered artifacts. */
export function renderHeader(merged: MergedRules): string {
  const fromRules = Object.keys(merged.prompts).length > 0
  const src = fromRules ? 'rules' : 'builtin'
  return `<!-- stk-rules: v${merged.rulesInfo.packVersion} (${src}) -->\n`
}

/** Default dirs for prompt fragments if a pack ships them standalone. */
export function defaultUserPromptsDir(): string {
  return join(homedir(), '.stk', 'rules.d')
}
