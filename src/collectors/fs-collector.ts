import type {
  CommandEntry,
  ConfigFileSummary,
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

export interface FsCollectResult {
  mcpList: McpEntry[]
  skillList: SkillEntry[]
  /** Slash commands discovered on the filesystem */
  commandList: CommandEntry[]
  pluginList: PluginEntry[]
  hookList: HookEntry[]
  ruleList: RuleEntry[]
  configFiles: ConfigFileSummary[]
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
  const projectSkills = scanSkills(`${process.cwd()}/.codebuddy/skills`, 'project')
  const marketplaceSkills = scanMarketplaceSkills(paths.pluginsMarketplacesDir, settings)
  // CodeBuddy shows commands alongside skills in /context as "Skills and slash commands"
  const userCommands = scanCommandsAsSkills(paths.commandsDir, 'user')
  const projectCommands = scanCommandsAsSkills(`${process.cwd()}/.codebuddy/commands`, 'project')
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
  const ruleList = [...scanRules(paths.rulesDir), ...scanRules(`${process.cwd()}/.codebuddy/rules`)]

  const configFiles: ConfigFileSummary[] = []
  for (const file of [paths.codebuddyMd, `${process.cwd()}/CODEBUDDY.md`, paths.mcp]) {
    configFiles.push(summarizeFile(file))
  }

  // Aggregate rules config file entries (one per directory)
  {
    const globalRules = scanRules(paths.rulesDir)
    if (globalRules.length > 0) {
      const totalSize = globalRules.reduce((sum, r) => sum + r.fileSizeBytes, 0)
      const totalTokens = globalRules.reduce((sum, r) => sum + r.estimatedTokens, 0)
      configFiles.push({
        path: paths.rulesDir,
        exists: true,
        sizeBytes: totalSize,
        lineCount: globalRules.length,
        estimatedTokens: totalTokens,
        impactLevel: impactLevel(totalSize),
      })
    }
  }
  {
    const projectRulesDir = `${process.cwd()}/.codebuddy/rules`
    const projectRules = ruleList.filter((r) => r.path.startsWith(projectRulesDir))
    if (projectRules.length > 0) {
      const totalSize = projectRules.reduce((sum, r) => sum + r.fileSizeBytes, 0)
      const totalTokens = projectRules.reduce((sum, r) => sum + r.estimatedTokens, 0)
      configFiles.push({
        path: projectRulesDir,
        exists: true,
        sizeBytes: totalSize,
        lineCount: projectRules.length,
        estimatedTokens: totalTokens,
        impactLevel: impactLevel(totalSize),
      })
    }
  }

  const codebuddyMdSize = configFiles.find((c) => c.path === paths.codebuddyMd)?.sizeBytes ?? 0
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
    configFiles,
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
      const skillsDir = `${pluginsDir}/${pluginId}/skills`
      const skills = scanSkills(skillsDir, 'plugin-marketplace')
      for (const s of skills) {
        entries.push({ ...s, source: 'plugin-marketplace' })
      }
    }
  }
  return entries
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

function summarizeFile(path: string): ConfigFileSummary {
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
