#!/usr/bin/env node
import { cac } from 'cac'
import { red, bold } from 'ansis'
import { runDiagnose } from './commands/diagnose.js'
import { runInit } from './commands/init.js'
import { runRollback } from './commands/rollback.js'

/**
 * CLI entry point for `stk`.
 * Registers the three top-level commands: diagnose, init, rollback (rollback reserved).
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const cli = cac('stk')

  cli
    .command('diagnose', 'Diagnose token usage by intercepting LLM requests via HTTP proxy')
    .option('--agent <name>', 'Target AI agent (default: codebuddy)', { default: 'codebuddy' })
    .option('--port <number>', 'Proxy listen port', { default: String(DEFAULT_PROXY_PORT) })
    .action(async (options: { agent: string; port: string }) => {
      await runDiagnose(options)
    })

  cli
    .command('init', 'Install stk Commands (and optional Skills) for an AI agent')
    .option('--local', 'Install to project-level .codebuddy/ instead of global ~/.codebuddy/')
    .option('--skills', 'Also install the 4 SKILL files')
    .option('--force', 'Overwrite existing files without prompting')
    .option('--agent <name>', 'Target AI agent (default: codebuddy)', { default: 'codebuddy' })
    .action(async (options: { local?: boolean; skills?: boolean; force?: boolean; agent: string }) => {
      await runInit(options)
    })

  cli
    .command('rollback', 'Restore configuration from backup (reserved)')
    .action(async () => {
      await runRollback()
    })

  cli.help()
  cli.version('0.1.0')

  try {
    // cac expects argv shaped like process.argv (node, script, ...args).
    await cli.parse(['node', 'stk', ...argv])
  } catch (err) {
    console.error(bold(red(`Error: ${(err as Error).message}`)))
    process.exitCode = 1
  }
}

// Run only when invoked directly (not when imported by tests).
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { DEFAULT_PROXY_PORT } from './types/index.js'
// Resolve symlinks: when installed via bin symlink, process.argv[1] is the
// symlink path while import.meta.url resolves to the real file.
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  main().catch(() => process.exit(1))
}
