#!/usr/bin/env node
import { cac } from 'cac'
import { red, bold } from 'ansis'
import { runDiagnose } from './commands/diagnose.js'
import { runInit } from './commands/init.js'
import { runInstall } from './commands/install.js'
import { runRollback } from './commands/rollback.js'
import { runProxy } from './commands/proxy.js'
import { runUsage } from './commands/usage.js'
import { runVerify } from './commands/verify.js'
import { runRulesUpdate, runRulesStatus } from './commands/rules.js'

/**
 * CLI entry point for `stk`.
 * Registers the top-level commands: diagnose, init, rollback (rollback reserved), install, proxy, verify.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const cli = cac('stk')

  cli
    .command('diagnose', 'Diagnose token usage by intercepting LLM requests via HTTP proxy')
    .option('--agent <name>', 'Target AI agent (default: codebuddy)', { default: 'codebuddy' })
    .option('--port <number>', 'Proxy listen port', { default: String(DEFAULT_PROXY_PORT) })
    .option(
      '--report-path <path>',
      'Write Markdown report to <path> instead of printing to console',
    )
    .action(async (options: { agent: string; port: string; reportPath?: string }) => {
      await runDiagnose(options)
    })

  cli
    .command('init', 'Install stk SKILL files for an AI agent')
    .option('--local', 'Install to project-level .codebuddy/ instead of global ~/.codebuddy/')
    .option('--force', 'Overwrite existing files without prompting')
    .option('--agent <name>', 'Target AI agent (default: codebuddy)')
    .action(async (options: { local?: boolean; force?: boolean; agent?: string }) => {
      await runInit(options)
    })

  cli.command('rollback', 'Restore configuration from backup (reserved)').action(async () => {
    await runRollback()
  })

  cli
    .command(
      'install <tool>',
      'Install a third-party token-saving tool and register it with an AI agent',
    )
    .option('-g, --global', 'Install to global ~/.codebuddy/ (default)')
    .option('--local', 'Install to project-level .codebuddy/ instead of global')
    .option('--agent <name>', 'Target AI agent (default: codebuddy)', { default: 'codebuddy' })
    .action(async (tool: string, options: { global?: boolean; local?: boolean; agent: string }) => {
      await runInstall(tool, options)
    })

  cli
    .command('proxy', 'Start a proxy that records all CodeBuddy API requests/responses to disk')
    .option('--port <number>', 'Proxy listen port (default: random)')
    .option('--upstream <url>', 'Upstream API base URL (default: CODEBUDDY_API_BASE env)')
    .option('--trace-dir <path>', 'Override trace output directory')
    .action(async (options: { port?: string; upstream?: string; traceDir?: string }) => {
      await runProxy({
        port: options.port ? Number(options.port) : undefined,
        upstream: options.upstream,
        traceDir: options.traceDir,
      })
    })

  cli
    .command('usage', 'Scan CodeBuddy session history and rank Tool/Skill/SubAgent/MCP usage')
    .option('--json', 'Print the full usage report as JSON to stdout')
    .action(async (options: { json?: boolean }) => {
      await runUsage(options)
    })

  cli
    .command('verify', 'Validate stk-analyze suggestion files against the format contract')
    .option('--file <path>', 'Validate a single suggestion file instead of all under save-token/')
    .action(async (options: { file?: string }) => {
      await runVerify(options)
    })

  cli
    .command('rules <action>', '规则库管理 (update: 更新优化规则包 | status: 查看规则库状态)')
    .option('--check', '仅检查新版本，不安装')
    .option('--json', '机器可读输出')
    .action(
      async (
        action: string,
        options: { check?: boolean; json?: boolean },
      ) => {
        if (action === 'update') {
          await runRulesUpdate(options)
        } else if (action === 'status') {
          await runRulesStatus(options)
        } else {
          console.error(`未知的 rules 子命令: ${action}（可用: update | status）`)
          process.exitCode = 1
        }
      },
    )

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
if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main().catch(() => process.exit(1))
}
