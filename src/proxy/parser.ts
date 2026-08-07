import { parseCodeBuddyRequestBody } from './codebuddy-parser.js'
import { parseClaudeRequestBody } from './claude-parser.js'
import { aggregateCaptures } from './parser-core.js'
import type { ProxyDiagnosisData } from '../types/index.js'

/**
 * Parse a single captured LLM POST request body into a ProxyDiagnosisData
 * fragment, dispatching to the parser for the agent that produced it.
 * Unknown agent names fall back to the CodeBuddy parser (the CLI default).
 */
export function parseRequestBody(body: unknown, agentName = 'codebuddy'): ProxyDiagnosisData {
  if (agentName === 'claude') return parseClaudeRequestBody(body)
  return parseCodeBuddyRequestBody(body)
}

export { aggregateCaptures }
