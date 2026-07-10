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
}
