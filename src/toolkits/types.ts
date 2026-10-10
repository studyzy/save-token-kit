/** Result of running a single shell step during `stk install`. */
export interface InstallStep {
  /** The shell command that was executed */
  cmd: string
  /** Whether the step succeeded (exit code 0) */
  ok: boolean
  /** Error message when ok is false */
  error?: string
}

/** Aggregate result of `stk install <toolkit>`. */
export interface InstallResult {
  /** Toolkit name that was targeted */
  toolkit: string
  /** Overall success: true only if every step succeeded */
  ok: boolean
  /** Per-step outcomes, in execution order */
  steps: InstallStep[]
}
