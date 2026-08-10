/**
 * Abstract adapter interface for supporting multiple AI agents.
 * Only the CodeBuddy implementation exists in this version; others are reserved.
 */

export interface InstallPaths {
  /** Directory where Command markdown files are written */
  commandsDir: string
  /** Directory where SKILL files are written (only used with --skills) */
  skillsDir: string
}

/** Platform-specific file paths discovered on the host. */
export interface PlatformConfigPaths {
  mcp: string
  settings: string
  codebuddyMd: string
  skillsDir: string
  commandsDir: string
  rulesDir: string
  agentsDir: string
  pluginsMarketplacesDir: string
  historyFile: string
  blobsDir: string
  /** CLI binary name used to trigger requests / headless probes */
  cliBinary: string
  /** Project-level agent instruction file (e.g. ./CLAUDE.md or ./CODEBUDDY.md) */
  projectCodebuddyMd: string
  /** Project-level skills directory */
  projectSkillsDir: string
  /** Project-level commands directory */
  projectCommandsDir: string
  /** Project-level rules directory */
  projectRulesDir: string
}

export interface PlatformAdapter {
  /** Stable agent identifier, e.g. "codebuddy" */
  readonly name: string
  /** Whether this agent is supported in the current version */
  readonly supported: boolean
  /** Human-readable status used in the interactive installer */
  readonly statusLabel: string
  /**
   * Resolve install directories.
   * @param local when true, install to project-level .codebuddy/; otherwise global ~/.codebuddy/
   */
  resolveInstallPaths(local: boolean): InstallPaths
  /** Environment variable name that points the agent at the proxy base URL */
  readonly proxyEnvVar: string
  /** URL path the agent appends to the base URL when talking to the API (e.g. "/v2" for CodeBuddy, "" for Claude/CodeX) */
  readonly proxyBasePath: string
  /** Trigger command used to force a single LLM request through the proxy */
  readonly triggerCommand: string[]
  /** Whether the agent CLI is installed and discoverable on PATH */
  detectInstall(): Promise<boolean>
  /** Resolve platform-specific file paths */
  getConfigPaths(): PlatformConfigPaths
  /** Build headless probe command args for a given prompt + optional JSON schema */
  getHeadlessCommand(prompt: string, schema?: object): string[]
  /** Parse raw headless probe stdout into structured data (null on failure) */
  parseHeadlessOutput(raw: string): unknown
  /** URL path prefix to capture (e.g. "/v2/" for CodeBuddy, "/v1/" for Claude) */
  readonly capturePathPrefix: string
  /** Default upstream API base URL (e.g. "https://api.anthropic.com") */
  readonly defaultApiBase: string
  /**
   * CLI args to append to `triggerCommand` that redirect this agent to a proxy
   * base URL. Return [] (default) to fall back to setting `proxyEnvVar`.
   * Some agents (e.g. CodeX) ignore env vars and route via config flags.
   */
  readonly proxyRedirectArgs?: (proxyBaseUrl: string) => string[]
  /**
   * Resolve the upstream API base URL this agent currently targets, so the proxy
   * can forward captured requests to the real backend. Defaults to
   * `proxyEnvVar`'s current value, falling back to `defaultApiBase`.
   */
  readonly resolveUpstreamBaseUrl?: () => string
  /**
   * Extra node child_process spawn options for the trigger command. Some agents
   * (e.g. CodeX) block on a piped stdin, so stdin must be ignored.
   */
  readonly triggerNodeOptions?: Record<string, unknown>
}
