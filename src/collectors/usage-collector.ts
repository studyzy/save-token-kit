/**
 * Collect usage statistics from the agent's session history JSONL files.
 *
 * CodeBuddy records every tool invocation as a `function_call` event in
 * `~/.codebuddy/projects/<encoded-project>/*.jsonl`:
 *
 *   {"type":"function_call","name":"Read","arguments":"{...}","timestamp":1727000000000}
 *
 * The collector streams files line by line (long sessions can be tens of MB),
 * pre-filters with a substring check so most lines never reach JSON.parse,
 * and aggregates four dimensions per time bucket (all / last 90 days /
 * last 30 days): tools, skills, subagents and MCP servers/tools.
 *
 * Privacy: only invocation events (names + identifying argument fields) are
 * read — never message content — and nothing but counters leaves the module.
 */
import { createReadStream, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { UsageDimension, UsageStats, UsageTimeBucket } from '../types/index.js'

export interface CollectUsageOptions {
  /** Session history directory (e.g. ~/.codebuddy/projects) */
  sessionsDir: string
  /** Override "now" for deterministic time-bucket tests (ms epoch) */
  now?: number
}

const DAY_MS = 86_400_000
const UNKNOWN = '<unknown>'
const MCP_PREFIX = 'mcp__'

/** Mutable per-dimension accumulator. */
interface DimensionAcc {
  total: number
  counts: Map<string, number>
}

/** Mutable accumulator for the three time buckets of one dimension. */
interface BucketAcc {
  all: DimensionAcc
  last90Days: DimensionAcc
  last30Days: DimensionAcc
}

interface Cutoffs {
  d90: number
  d30: number
}

function newDimension(): DimensionAcc {
  return { total: 0, counts: new Map() }
}

function newBucket(): BucketAcc {
  return { all: newDimension(), last90Days: newDimension(), last30Days: newDimension() }
}

function add(dim: DimensionAcc, name: string): void {
  dim.total++
  dim.counts.set(name, (dim.counts.get(name) ?? 0) + 1)
}

/** Record one invocation into the buckets its timestamp falls into. */
function record(bucket: BucketAcc, name: string, tsSec: number | null, cutoffs: Cutoffs): void {
  add(bucket.all, name)
  if (tsSec === null) return
  if (tsSec >= cutoffs.d90) add(bucket.last90Days, name)
  if (tsSec >= cutoffs.d30) add(bucket.last30Days, name)
}

function toDimension(acc: DimensionAcc): UsageDimension {
  const ranking = [...acc.counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return { total: acc.total, ranking }
}

function toBucket(acc: BucketAcc): UsageTimeBucket {
  return {
    all: toDimension(acc.all),
    last90Days: toDimension(acc.last90Days),
    last30Days: toDimension(acc.last30Days),
  }
}

/** Recursively list `*.jsonl` files under dir (missing dir → empty list). */
function listJsonlFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p)
    }
  }
  walk(dir)
  return out
}

/** Parse `arguments` (JSON string or object) into a plain object, or null. */
function extractArgs(raw: unknown): Record<string, unknown> | null {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** First present non-empty string field among keys, or null. */
function extractName(args: Record<string, unknown> | null, keys: string[]): string | null {
  if (!args) return null
  for (const k of keys) {
    const v = args[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** Split `mcp__<server>__<tool>` into its server part, or null when malformed. */
function parseMcpServer(name: string): string | null {
  if (!name.startsWith(MCP_PREFIX)) return null
  const rest = name.slice(MCP_PREFIX.length)
  const idx = rest.indexOf('__')
  if (idx <= 0) return null
  return rest.slice(0, idx)
}

/** Mutable counters shared across files during a scan. */
interface ScanState {
  filesScanned: number
  parseErrors: number
  missingTimestamp: number
  tool: BucketAcc
  skill: BucketAcc
  subagent: BucketAcc
  mcpServer: BucketAcc
  mcpTool: BucketAcc
}

async function scanFile(path: string, state: ScanState, cutoffs: Cutoffs): Promise<void> {
  const stream = createReadStream(path, { encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of rl) {
    // Cheap pre-filter: skip lines that cannot be function_call events without
    // paying for JSON.parse. False positives are harmless (type check below).
    if (!line.includes('"function_call"')) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line) as Record<string, unknown>
    } catch {
      state.parseErrors++
      continue
    }
    if (rec.type !== 'function_call') continue
    const name = rec.name
    if (typeof name !== 'string' || !name) continue

    const ts = rec.timestamp
    const tsSec = typeof ts === 'number' && Number.isFinite(ts) ? ts / 1000 : null
    if (tsSec === null) state.missingTimestamp++

    record(state.tool, name, tsSec, cutoffs)

    if (name === 'Skill') {
      const args = extractArgs(rec.arguments)
      const skillName = extractName(args, ['skill', 'command']) ?? UNKNOWN
      record(state.skill, skillName, tsSec, cutoffs)
    } else if (name === 'Task' || name === 'Agent') {
      const args = extractArgs(rec.arguments)
      const agentName = extractName(args, ['subagent_type', 'name']) ?? UNKNOWN
      record(state.subagent, agentName, tsSec, cutoffs)
    }

    const server = parseMcpServer(name)
    if (server !== null) {
      record(state.mcpServer, server, tsSec, cutoffs)
      record(state.mcpTool, name, tsSec, cutoffs)
    }
  }
}

/**
 * Scan the session history directory and aggregate usage statistics.
 * A missing or empty directory yields an all-zero report — never a throw.
 */
export async function collectUsageStats(options: CollectUsageOptions): Promise<UsageStats> {
  const nowMs = options.now ?? Date.now()
  const nowSec = Math.floor(nowMs / 1000)
  const cutoffs: Cutoffs = {
    d90: nowSec - (90 * DAY_MS) / 1000,
    d30: nowSec - (30 * DAY_MS) / 1000,
  }
  const state: ScanState = {
    filesScanned: 0,
    parseErrors: 0,
    missingTimestamp: 0,
    tool: newBucket(),
    skill: newBucket(),
    subagent: newBucket(),
    mcpServer: newBucket(),
    mcpTool: newBucket(),
  }

  if (existsSync(options.sessionsDir)) {
    for (const file of listJsonlFiles(options.sessionsDir)) {
      state.filesScanned++
      await scanFile(file, state, cutoffs)
    }
  }

  return {
    scannedAt: new Date(nowMs).toISOString(),
    sessionsDir: options.sessionsDir,
    filesScanned: state.filesScanned,
    parseErrors: state.parseErrors,
    missingTimestamp: state.missingTimestamp,
    toolUsage: toBucket(state.tool),
    skillUsage: toBucket(state.skill),
    subagentUsage: toBucket(state.subagent),
    mcpServerUsage: toBucket(state.mcpServer),
    mcpToolUsage: toBucket(state.mcpTool),
  }
}
