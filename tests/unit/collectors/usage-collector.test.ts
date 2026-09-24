import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectUsageStats } from '@/collectors/usage-collector.js'

/** Fixed "now" for deterministic time-bucket assertions. */
const NOW = new Date('2026-09-24T12:00:00Z').getTime()
const DAY_MS = 86_400_000

/** Build one function_call JSONL line. */
function fc(
  name: string,
  args?: unknown,
  timestamp?: number,
): string {
  const rawArgs =
    args === undefined
      ? '{}'
      : typeof args === 'string'
        ? args
        : JSON.stringify(args)
  const rec: Record<string, unknown> = { type: 'function_call', name, arguments: rawArgs }
  if (timestamp !== undefined) rec.timestamp = timestamp
  return JSON.stringify(rec)
}

describe('collectUsageStats', () => {
  let tmp: string
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  function setup(files: Record<string, string>): string {
    tmp = mkdtempSync(join(tmpdir(), 'stk-usage-'))
    for (const [rel, content] of Object.entries(files)) {
      const p = join(tmp, rel)
      mkdirSync(join(p, '..'), { recursive: true })
      writeFileSync(p, content)
    }
    return tmp
  }

  it('ranks tool invocations across nested files', async () => {
    const dir = setup({
      'proj-a/s1.jsonl': [fc('Read', undefined, NOW), fc('Read', undefined, NOW), fc('Bash', undefined, NOW)].join('\n'),
      'proj-b/s2.jsonl': fc('Read', undefined, NOW),
    })
    const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })

    expect(stats.filesScanned).toBe(2)
    expect(stats.toolUsage.all.total).toBe(4)
    expect(stats.toolUsage.all.ranking[0]).toEqual({ name: 'Read', count: 3 })
    expect(stats.toolUsage.all.ranking[1]).toEqual({ name: 'Bash', count: 1 })
  })

  it('tolerates invalid lines without aborting the scan', async () => {
    const dir = setup({
      's.jsonl': [
        'not-json-at-all', // 无标记 → 被快筛跳过，不计 parseErrors
        '{"type":"function_call","name":"Read"', // 含标记但截断 → parseErrors
        JSON.stringify({ type: 'user', message: 'mentions "function_call" in text' }),
        JSON.stringify({ type: 'function_call' }), // 缺 name
        fc('Read', undefined, NOW),
      ].join('\n'),
    })
    const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })

    expect(stats.parseErrors).toBe(1)
    expect(stats.toolUsage.all.total).toBe(1)
    expect(stats.toolUsage.all.ranking).toEqual([{ name: 'Read', count: 1 }])
  })

  it('returns all-zero stats when the directory does not exist', async () => {
    const stats = await collectUsageStats({ sessionsDir: '/nonexistent/stk-sessions', now: NOW })

    expect(stats.filesScanned).toBe(0)
    expect(stats.parseErrors).toBe(0)
    expect(stats.toolUsage.all.total).toBe(0)
    expect(stats.skillUsage.all.total).toBe(0)
    expect(stats.subagentUsage.all.total).toBe(0)
    expect(stats.mcpServerUsage.all.total).toBe(0)
    expect(stats.mcpToolUsage.all.total).toBe(0)
  })

  it('returns filesScanned 0 for an empty directory', async () => {
    const dir = setup({})
    const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })
    expect(stats.filesScanned).toBe(0)
  })

  describe('skill dimension', () => {
    it('extracts skill names from the skill/command argument', async () => {
      const dir = setup({
        's.jsonl': [
          fc('Skill', { skill: 'commit' }, NOW),
          fc('Skill', { command: 'pdf' }, NOW),
          fc('Skill', { skill: 'commit' }, NOW),
        ].join('\n'),
      })
      const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })

      expect(stats.skillUsage.all.total).toBe(3)
      expect(stats.skillUsage.all.ranking[0]).toEqual({ name: 'commit', count: 2 })
      expect(stats.skillUsage.all.ranking[1]).toEqual({ name: 'pdf', count: 1 })
    })

    it('falls back to <unknown> for missing, empty or unparseable arguments', async () => {
      const dir = setup({
        's.jsonl': [
          fc('Skill', undefined, NOW), // 无参数
          fc('Skill', {}, NOW), // 空参数
          fc('Skill', 'not-json{', NOW), // arguments 不可解析
          fc('Skill', { skill: '   ' }, NOW), // 空白
          fc('Skill', [1, 2], NOW), // 非对象 arguments
        ].join('\n'),
      })
      const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })

      expect(stats.skillUsage.all.total).toBe(5)
      expect(stats.skillUsage.all.ranking).toEqual([{ name: '<unknown>', count: 5 }])
    })
  })

  describe('subagent dimension', () => {
    it('counts Task/Agent calls by subagent_type or name', async () => {
      const dir = setup({
        's.jsonl': [
          fc('Task', { subagent_type: 'Explore' }, NOW),
          fc('Agent', { name: 'code-reviewer' }, NOW),
          fc('Task', { subagent_type: 'Explore' }, NOW),
          fc('Task', {}, NOW),
        ].join('\n'),
      })
      const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })

      expect(stats.subagentUsage.all.total).toBe(4)
      // 并列计数按名称字母序稳定排序（'<' 字符序最小，故 <unknown> 在前）
      expect(stats.subagentUsage.all.ranking).toEqual([
        { name: 'Explore', count: 2 },
        { name: '<unknown>', count: 1 },
        { name: 'code-reviewer', count: 1 },
      ])
    })
  })

  describe('mcp dimensions', () => {
    it('counts invocations by both server and full tool name', async () => {
      const dir = setup({
        's.jsonl': [
          fc('mcp__playwright__browser_navigate', undefined, NOW),
          fc('mcp__playwright__browser_click', undefined, NOW),
          fc('mcp__playwright__browser_navigate', undefined, NOW),
          fc('mcp__github__search', undefined, NOW),
        ].join('\n'),
      })
      const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })

      expect(stats.mcpServerUsage.all.ranking).toEqual([
        { name: 'playwright', count: 3 },
        { name: 'github', count: 1 },
      ])
      expect(stats.mcpToolUsage.all.ranking).toEqual([
        { name: 'mcp__playwright__browser_navigate', count: 2 },
        { name: 'mcp__github__search', count: 1 },
        { name: 'mcp__playwright__browser_click', count: 1 },
      ])
    })

    it('ignores malformed mcp names in server dimension but keeps tool totals', async () => {
      const dir = setup({
        's.jsonl': [fc('mcp__orphan', undefined, NOW), fc('mcp__', undefined, NOW)].join('\n'),
      })
      const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })

      expect(stats.mcpServerUsage.all.total).toBe(0)
      expect(stats.toolUsage.all.total).toBe(2)
    })
  })

  describe('time buckets', () => {
    it('routes invocations into all/90d/30d buckets by timestamp', async () => {
      const dir = setup({
        's.jsonl': [
          fc('Read', undefined, NOW - 1 * DAY_MS), // 三个桶都计入
          fc('Grep', undefined, NOW - 60 * DAY_MS), // 全部 + 90 天
          fc('Bash', undefined, NOW - 120 * DAY_MS), // 仅全部
          fc('Write'), // 无时间戳 → 仅全部
        ].join('\n'),
      })
      const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })

      expect(stats.missingTimestamp).toBe(1)
      // 全部计数并列 1 时按名称字母序
      expect(stats.toolUsage.all.ranking.map((r) => r.name)).toEqual(['Bash', 'Grep', 'Read', 'Write'])
      expect(stats.toolUsage.last90Days.ranking.map((r) => r.name)).toEqual(['Grep', 'Read'])
      expect(stats.toolUsage.last30Days.ranking).toEqual([{ name: 'Read', count: 1 }])
      // 缺时间戳记录只进"全部"，细分维度同理
      expect(stats.toolUsage.all.total).toBe(4)
      expect(stats.toolUsage.last90Days.total).toBe(2)
      expect(stats.toolUsage.last30Days.total).toBe(1)
    })

    it('applies buckets to skill/subagent/mcp dimensions too', async () => {
      const dir = setup({
        's.jsonl': [
          fc('Skill', { skill: 'commit' }, NOW - 1 * DAY_MS),
          fc('Skill', { skill: 'pdf' }, NOW - 120 * DAY_MS),
          fc('mcp__github__search', undefined, NOW - 60 * DAY_MS),
          fc('Task', { subagent_type: 'Explore' }, NOW - 1 * DAY_MS),
        ].join('\n'),
      })
      const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })

      expect(stats.skillUsage.all.total).toBe(2)
      expect(stats.skillUsage.last30Days.ranking).toEqual([{ name: 'commit', count: 1 }])
      expect(stats.mcpServerUsage.last90Days.total).toBe(1)
      expect(stats.mcpServerUsage.last30Days.total).toBe(0)
      expect(stats.subagentUsage.last30Days.total).toBe(1)
    })
  })

  it('does not read message content into the report (privacy)', async () => {
    const secret = 'SECRET-CONVERSATION-TEXT'
    const dir = setup({
      's.jsonl': [
        JSON.stringify({ type: 'user', message: { content: secret } }),
        fc('Read', { skill: secret }, NOW),
      ].join('\n'),
    })
    const stats = await collectUsageStats({ sessionsDir: dir, now: NOW })
    // Skill 参数中的标识字段允许出现，但用户消息正文绝不进入任何字段
    const serialized = JSON.stringify(stats)
    expect(serialized).not.toContain('SECRET-CONVERSATION-TEXT')
  })
})
