/**
 * Abstract adapter interface for supporting multiple AI agents.
 * Capability sub-interfaces below let `diagnose` dispatch on *what an adapter
 * can do* (type-guarded) instead of branching on concrete classes, so adding a
 * platform never requires opening holes in the generic flow.
 */

/** Adapters that must inject/remove a custom model to capture real traffic. */
export interface ModelInjectionCapability {
  /**
   * Inject a `stk-diagnose` custom model pointing at the proxy; return prior
   * state to restore later, or null when no change was needed (already injected).
   */
  injectDiagnoseModel(proxyBaseUrl: string): Array<Record<string, unknown>> | null
  /** Restore the models config to the state returned by `injectDiagnoseModel`. */
  removeDiagnoseModel(prevModels: Array<Record<string, unknown>>): void
}

/** Type guard: does this adapter support custom-model injection? */
export function supportsModelInjection(
  adapter: PlatformAdapter,
): adapter is PlatformAdapter & ModelInjectionCapability {
  const a = adapter as Partial<ModelInjectionCapability>
  return typeof a.injectDiagnoseModel === 'function' && typeof a.removeDiagnoseModel === 'function'
}

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
  /**
   * Directory containing session history JSONL files (e.g.
   * `~/.codebuddy/projects`). Only set for agents whose session format is
   * supported; absent means usage-history collection is skipped.
   */
  sessionsDir?: string
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
  /** URL path the agent appends to the base URL when talking to the API (e.g. "/v1" for CodeBuddy/CodeX, "" for Claude) */
  readonly proxyBasePath: string
  /** Trigger command used to force a single LLM request through the proxy */
  readonly triggerCommand: string[]
  /** Whether the agent CLI is installed and discoverable on PATH */
  detectInstall(): Promise<boolean>
  /** Resolve platform-specific file paths */
  getConfigPaths(): PlatformConfigPaths
  /**
   * Absolute path to this agent's settings.json (the file the `plugin-enabled`
   * toolkit primitive reads). Exposed as a method so `diagnose` reads the
   * settings of the *agent being diagnosed* rather than a hard-coded default.
   */
  getSettingsPath(): string
  /** Build headless probe command args for a given prompt + optional JSON schema */
  getHeadlessCommand(prompt: string, schema?: object): string[]
  /** Parse raw headless probe stdout into structured data (null on failure) */
  parseHeadlessOutput(raw: string): unknown
  /** URL path prefix to capture (e.g. "/v1/" for CodeBuddy/Claude/CodeX) */
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
  /**
   * Allowlist of environment variable keys for the probe child process (the
   * proxy redirect var is always included automatically). When set, the probe
   * is spawned with ONLY these variables instead of the full inherited env.
   * Reason: CodeBuddy's headless probe hangs silently before sending any
   * request when spawned without a TTY under a full interactive-shell env
   * (JetBrains/Fig terminal markers etc.); a minimal env completes in ~35s.
   */
  readonly probeEnvKeys?: readonly string[]
  /**
   * Extra env vars injected into the probe child process (over the allowlist,
   * under the proxy redirect var). Used to neutralize known-slow hooks during
   * probing: hooks add no diagnostic value (their data is collected from the
   * filesystem instead) but a hook that blocks UserPromptSubmit prevents the
   * probe from ever sending a request.
   */
  readonly probeEnv?: Readonly<Record<string, string>>
  /**
   * Whether the agent's own config (e.g. `~/.claude/settings.json` env) can
   * override the proxy env var set by `diagnose`. When true, `diagnose` must
   * isolate the agent's config dir so the process-env redirection actually
   * takes effect.
   */
  readonly needsIsolatedConfigDir?: boolean
  /**
   * Environment variable that points the agent at its config directory (e.g.
   * `CLAUDE_CONFIG_DIR` for Claude Code). Required when
   * `needsIsolatedConfigDir` is true, so `diagnose` can redirect the probe to a
   * temp dir without hard-coding any platform's variable name.
   */
  readonly configDirEnvVar?: string
  /**
   * Whether config-dir isolation is actually required right now. Isolation
   * hides everything the config dir provides (user skills, rules, CLAUDE.md,
   * OAuth credentials), which distorts the diagnosis report. It is only needed
   * when the agent's config would otherwise override the proxy env var — e.g.
   * Claude Code only does so when `settings.json` sets `ANTHROPIC_BASE_URL`.
   * Agents without this hook are isolated whenever `needsIsolatedConfigDir` is true.
   */
  readonly shouldIsolateConfigDir?: () => boolean
  /**
   * A placeholder credential to inject when config-dir isolation leaves the
   * probe unauthenticated. Claude Code's OAuth session lives in the config dir
   * (`.credentials.json` / keychain), not in `settings.json` env, so isolation
   * makes it exit with "Not logged in" and send no request. The mock proxy does
   * not validate keys, so a placeholder lets the probe reach the proxy.
   * Return null when the agent authenticates some other way (leave env untouched).
   */
  readonly isolatedProbeCredential?: () => { key: string; value: string } | null
  /**
   * Environment variables to retain from the agent's own config (e.g.
   * `~/.claude/settings.json` env) when `diagnose` isolates the config dir.
   * The proxy env var (`ANTHROPIC_BASE_URL`) is intentionally excluded so the
   * proxy redirection wins. Used to preserve credentials (e.g. `ANTHROPIC_AUTH_TOKEN`)
   * that would otherwise be hidden by config-dir isolation.
   */
  readonly configDirRetainedEnv?: () => Record<string, string>
  /**
   * When true, `diagnose` cannot auto-trigger a probe request (the agent is a
   * persistent daemon, e.g. the WorkBuddy desktop whose real prompt is produced
   * by its own templates/sidecar). Instead, `diagnose` starts the proxy, prints
   * guidance for redirecting the running agent to it, and waits for the user to
   * manually produce a request (with a timeout) before building the report.
   */
  readonly requiresManualTrigger?: boolean
}
