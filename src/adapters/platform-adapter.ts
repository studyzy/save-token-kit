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
}
