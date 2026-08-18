import type {
  CommandEntry,
  MemoryFileSummary,
  HookEntry,
  McpEntry,
  PluginEntry,
  RuleEntry,
  SkillEntry,
} from '../types/index.js'
import { MCP_CLI_ALTERNATIVES, LOW_FREQUENCY_PLUGINS } from '../types/index.js'
import type { PlatformAdapter } from '../adapters/platform-adapter.js'
import {
  exists,
  getStats,
  readDir,
  readFile,
  isDirectory,
  readJsonSafe,
} from '../utils/fs-operations.js'
import { estimate, estimateMcpTokens, impactLevel } from './token-estimator.js'
import { getHomeDir } from '../utils/platform.js'
import { dirname } from 'node:path'

export interface FsCollectResult {
  mcpList: McpEntry[]
  skillList: SkillEntry[]
  /** Slash commands discovered on the filesystem */
  commandList: CommandEntry[]
  pluginList: PluginEntry[]
  hookList: HookEntry[]
  ruleList: RuleEntry[]
  memoryFiles: MemoryFileSummary[]
  codebuddyMdSize: number
  historySize: number
}

interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>
  disabledMcpServers?: string[]
}

interface McpServerConfig {
  type?: string
  command?: string
  url?: string
  args?: string[]
  defer_loading?: boolean
  tools?: Record<string, { defer_loading?: boolean }>
}

interface SettingsFile {
  enabledPlugins?: Record<string, boolean>
  hooks?: Record<string, Array<HookConfig>>
  model?: string
  deferToolLoading?: boolean
  reasoningEffort?: string
}

interface HookConfig {
  matcher?: string
  hooks?: Array<{ type: string; command: string; timeout?: number }>
}

/**
 * Scan CodeBuddy config directory via filesystem and assemble structured results.
 */
export function scanFilesystem(adapter: PlatformAdapter): FsCollectResult {
  const paths = adapter.getConfigPaths()

  const mcpList = scanMcpConfig(paths.mcp)
  const settings = readSettings(paths.settings)
  const pluginList = scanPlugins(settings)
  const hookList = scanHooks(settings)
  const skillList = scanSkills(paths.skillsDir, 'user')
  const projectSkills = scanSkills(paths.projectSkillsDir, 'project')
  const marketplaceSkills = scanMarketplaceSkills(paths.pluginsMarketplacesDir, settings)
  // CodeBuddy shows commands alongside skills in /context as "Skills and slash commands"
  const userCommands = scanCommandsAsSkills(paths.commandsDir, 'user')
  const projectCommands = scanCommandsAsSkills(paths.projectCommandsDir, 'project')
  const allSkills = [
    ...skillList,
    ...projectSkills,
    ...marketplaceSkills,
    ...userCommands,
    ...projectCommands,
  ]
  // Commands are also surfaced as a dedicated list (distinct from skills).
  const commandList = [...userCommands, ...projectCommands]

  // Scan rules directories (both global and project-local)
  const ruleList = [...scanRules(paths.rulesDir), ...scanRules(paths.projectRulesDir)]

  const memoryFiles: MemoryFileSummary[] = []
  const memoryPaths = [paths.codebuddyMd, paths.projectCodebuddyMd]
  if (paths.codebuddyMd.includes('.codebuddy')) {
    memoryPaths.push(`${getHomeDir()}/.codebuddy/AGENTS.md`)
    memoryPaths.push(`${process.cwd()}/AGENTS.md`)
  }
  // CodeX stores instructions in AGENTS.md; the config-dir file is already
  // covered by `paths.codebuddyMd`, so only add the project-level AGENTS.md.
  if (paths.codebuddyMd.includes('.codex')) {
    memoryPaths.push(`${process.cwd()}/AGENTS.md`)
  }
  for (const file of memoryPaths) {
    if (file) memoryFiles.push(summarizeFile(file))
  }

  const codebuddyMdSize = memoryFiles.find((c) => c.path === paths.codebuddyMd)?.sizeBytes ?? 0
  const historySize = summarizeFile(paths.historyFile).sizeBytes

  // Detect duplicate skills (same name from multiple sources)
  detectDuplicateSkills(allSkills)

  return {
    mcpList,
    skillList: allSkills,
    commandList,
    pluginList,
    hookList,
    ruleList,
    memoryFiles,
    codebuddyMdSize,
    historySize,
  }
}

function scanMcpConfig(path: string): McpEntry[] {
  const config = readJsonSafe<McpConfigFile>(path)
  if (!config) return []
  const entries: McpEntry[] = []
  const disabled = new Set(config.disabledMcpServers ?? [])
  for (const [name, server] of Object.entries(config.mcpServers ?? {})) {
    const cliAlt = MCP_CLI_ALTERNATIVES[name]
    const configStr = JSON.stringify(server)
    entries.push({
      name,
      status: disabled.has(name) ? 'disabled' : 'enabled',
      type: (server.type as 'stdio' | 'sse' | 'http') ?? 'stdio',
      command: server.command,
      url: server.url,
      toolsCount: null as unknown as number,
      deferLoading: !!server.defer_loading,
      source: 'user',
      estimatedTokens: estimateMcpTokens(null, configStr.length),
      hasCliAlternative: !!cliAlt,
      cliAlternative: cliAlt,
    })
  }
  return entries
}

function readSettings(path: string): SettingsFile {
  return readJsonSafe<SettingsFile>(path) ?? {}
}

function scanPlugins(settings: SettingsFile): PluginEntry[] {
  const entries: PluginEntry[] = []
  for (const [id, enabled] of Object.entries(settings.enabledPlugins ?? {})) {
    const [pluginId, marketplace] = id.split('@')
    entries.push({
      id,
      pluginId: pluginId ?? id,
      marketplace: marketplace ?? '',
      enabled: !!enabled,
      installedPath: null,
      isLowFrequency: LOW_FREQUENCY_PLUGINS.has(id),
    })
  }
  return entries
}

function scanHooks(settings: SettingsFile): HookEntry[] {
  const entries: HookEntry[] = []
  for (const [event, hooks] of Object.entries(settings.hooks ?? {})) {
    for (const cfg of hooks ?? []) {
      const matcher = cfg.matcher ?? '*'
      for (const h of cfg.hooks ?? []) {
        entries.push({
          event,
          matcher,
          command: h.command,
          timeout: h.timeout ?? null,
          source: 'settings',
        })
      }
    }
  }
  return entries
}

function scanSkills(dir: string, source: SkillEntry['source']): SkillEntry[] {
  if (!exists(dir) || !isDirectory(dir)) return []
  const entries: SkillEntry[] = []
  for (const name of readDir(dir)) {
    const skillDir = `${dir}/${name}`
    if (!isDirectory(skillDir) || name.startsWith('.')) continue
    const skillMd = `${skillDir}/SKILL.md`
    if (!exists(skillMd)) continue
    const content = readFile(skillMd)
    const stats = getStats(skillMd)
    const { description, model, context } = parseSkillFrontmatter(content)
    entries.push({
      name,
      source,
      sourcePath: skillMd,
      description,
      model,
      context,
      fileSizeBytes: stats.size,
      estimatedTokens: estimate(content),
      loaded: null,
    })
  }
  return entries
}

function scanMarketplaceSkills(marketplacesDir: string, settings: SettingsFile): SkillEntry[] {
  const entries: SkillEntry[] = []
  if (!exists(marketplacesDir) || !isDirectory(marketplacesDir)) return entries

  const enabledPluginIds = new Set<string>()
  const enabledMarketplaces = new Set<string>()
  for (const [fullId, enabled] of Object.entries(settings.enabledPlugins ?? {})) {
    if (enabled) {
      const [pluginId, marketplace] = fullId.split('@')
      enabledPluginIds.add(`${marketplace}/${pluginId}`)
      enabledMarketplaces.add(marketplace ?? '')
    }
  }

  for (const marketplace of readDir(marketplacesDir)) {
    const mpDir = `${marketplacesDir}/${marketplace}`
    if (!isDirectory(mpDir)) continue

    const mpSkillsDir = `${mpDir}/skills`
    if (exists(mpSkillsDir) && enabledMarketplaces.has(marketplace)) {
      const mpSkills = scanSkills(mpSkillsDir, 'plugin-marketplace')
      for (const s of mpSkills) {
        entries.push({ ...s, source: 'plugin-marketplace' })
      }
    }

    const pluginsDir = `${mpDir}/plugins`
    if (!exists(pluginsDir)) continue
    for (const pluginId of readDir(pluginsDir)) {
      if (!enabledPluginIds.has(`${marketplace}/${pluginId}`)) continue
      const pluginDir = `${pluginsDir}/${pluginId}`
      // Subdir layout: multiple skills under plugins/<pluginId>/skills/
      const skillsDir = `${pluginDir}/skills`
      const skills = scanSkills(skillsDir, 'plugin-marketplace')
      for (const s of skills) {
        entries.push({ ...s, source: 'plugin-marketplace' })
      }
      // Flat layout: a plugin whose SKILL.md sits directly in plugins/<pluginId>/
      if (skills.length === 0) {
        const flat = scanFlatSkill(`${pluginDir}/SKILL.md`, pluginId)
        if (flat) entries.push(flat)
      }
    }
  }

  // The runtime cache is a sibling of marketplaces/ and may hold plugins whose
  // marketplace dir is empty (e.g. content-research-writer). Cache layout:
  // plugins/cache/<marketplace>/<pluginId>/<version>/SKILL.md
  const cacheDir = `${dirname(marketplacesDir)}/cache`
  if (exists(cacheDir) && isDirectory(cacheDir)) {
    for (const marketplace of readDir(cacheDir)) {
      const mpCacheDir = `${cacheDir}/${marketplace}`
      if (!isDirectory(mpCacheDir)) continue
      for (const pluginId of readDir(mpCacheDir)) {
        if (!enabledPluginIds.has(`${marketplace}/${pluginId}`)) continue
        const pluginDir = `${mpCacheDir}/${pluginId}`
        if (!isDirectory(pluginDir)) continue
        for (const version of readDir(pluginDir)) {
          const versionDir = `${pluginDir}/${version}`
          if (!isDirectory(versionDir)) continue
          const subSkills = scanSkills(`${versionDir}/skills`, 'plugin-marketplace')
          for (const s of subSkills) {
            entries.push({ ...s, source: 'plugin-marketplace' })
          }
          const flat = scanFlatSkill(`${versionDir}/SKILL.md`, pluginId)
          if (flat) entries.push(flat)
        }
      }
    }
  }

  return entries
}

/**
 * Scan a single flat-layout plugin skill (SKILL.md directly in a plugin dir).
 * Returns null when the file does not exist.
 */
function scanFlatSkill(skillMd: string, fallbackName: string): SkillEntry | null {
  if (!exists(skillMd)) return null
  const content = readFile(skillMd)
  const stats = getStats(skillMd)
  const { name: frontName, description, model, context } = parseSkillFrontmatter(content)
  return {
    name: frontName ?? fallbackName,
    source: 'plugin-marketplace',
    sourcePath: skillMd,
    description,
    model,
    context,
    fileSizeBytes: stats.size,
    estimatedTokens: estimate(content),
    loaded: null,
  }
}

/**
 * Scan commands/ directory as skills (CodeBuddy shows commands alongside skills
 * in /context under "Skills and slash commands").
 */
function scanCommandsAsSkills(dir: string, source: SkillEntry['source']): CommandEntry[] {
  const entries: CommandEntry[] = []
  if (!exists(dir) || !isDirectory(dir)) return entries
  for (const entry of readDir(dir)) {
    const fullPath = `${dir}/${entry}`
    if (isDirectory(fullPath)) {
      const nested = scanCommandsAsSkills(fullPath, source)
      entries.push(...nested)
    } else if (entry.endsWith('.md')) {
      const content = readFile(fullPath)
      const { name: frontName, description } = parseSkillFrontmatter(content)
      const fileName = entry.replace(/\.md$/, '')
      const name = frontName ?? fileName
      entries.push({
        name,
        source,
        sourcePath: fullPath,
        description,
      })
    }
  }
  return entries
}

function parseSkillFrontmatter(content: string): {
  name?: string
  description: string
  model?: string
  context?: string
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { description: '' }
  const frontmatter = match[1] ?? ''
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const desc = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  const model = frontmatter.match(/^model:\s*(.+)$/m)?.[1]?.trim()
  const context = frontmatter.match(/^context:\s*(.+)$/m)?.[1]?.trim()
  return {
    name,
    description: desc ?? '',
    model,
    context,
  }
}

function summarizeFile(path: string): MemoryFileSummary {
  if (!exists(path)) {
    return {
      path,
      exists: false,
      sizeBytes: 0,
      lineCount: 0,
      estimatedTokens: 0,
      impactLevel: 'low',
    }
  }
  const content = readFile(path)
  const stats = getStats(path)
  const lineCount = content.split('\n').length
  return {
    path,
    exists: true,
    sizeBytes: stats.size,
    lineCount,
    estimatedTokens: estimate(content),
    impactLevel: impactLevel(stats.size),
  }
}

/**
 * Scan rules/ directory for .md rule files.
 * Distinguishes always-loaded rules (no paths: frontmatter) from path-scoped.
 */
function scanRules(dir: string): RuleEntry[] {
  const entries: RuleEntry[] = []
  if (!exists(dir) || !isDirectory(dir)) return entries
  for (const entry of readDir(dir)) {
    const fullPath = `${dir}/${entry}`
    if (isDirectory(fullPath)) {
      entries.push(...scanRules(fullPath))
    } else if (entry.endsWith('.md')) {
      const content = readFile(fullPath)
      const stats = getStats(fullPath)
      const name = entry.replace(/\.md$/, '')
      const alwaysLoaded = !/^paths:\s/m.test(content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '')
      entries.push({
        name,
        path: fullPath,
        alwaysLoaded,
        fileSizeBytes: stats.size,
        estimatedTokens: estimate(content),
      })
    }
  }
  return entries
}

/**
 * Detect duplicate skills (same name appearing from multiple sources).
 */
function detectDuplicateSkills(skills: SkillEntry[]): void {
  const seen = new Map<string, SkillEntry>()
  for (const s of skills) {
    const existing = seen.get(s.name)
    if (existing) {
      existing.duplicateSource = existing.duplicateSource ?? existing.source
      s.duplicateSource = s.source
    } else {
      seen.set(s.name, s)
    }
  }
}
