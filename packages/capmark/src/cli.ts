/**
 * `capmark lint [path]` — check a manifest and say what is wrong with it.
 *
 * Zero dependencies and hand-rolled argument handling, because a linter that
 * plugin authors are meant to put in CI should not drag a tree of packages in
 * behind it. Exit codes are the contract: 0 clean, 1 findings, 2 misuse.
 */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { compile, TARGETS, type Target } from './compile.ts'
import { discover } from './discover.ts'
import { hasErrors, lint } from './lint.ts'
import { parse } from './parse.ts'
import { review, shouldRefuse } from './review.ts'

const USAGE = `capmark — capability manifests for agent plugins

Usage:
  capmark lint [path]     check a CAP.md (default: ./CAP.md)
  capmark review <dir>    read what a plugin declares, before installing it
  capmark compile <path> --target <t>
                          restate a manifest where another spec expects it
                          (t: dsh, agent-plugins, skill)

Options:
  --json                  machine-readable output on stdout
  -h, --help              show this help

Exit codes:
  0  clean
  1  findings (lint), or something a reviewer should read (review)
  2  could not run (bad usage, unreadable file)

review answers the question a gate cannot: a plugin's own code runs with full
privileges when it is mounted, so the moment to weigh what it asks for is
before its row is written.
`

interface Output {
  file: string
  ok: boolean
  findings: { rule: string; severity: string; line: number; message: string }[]
}

/** Accept a directory and look inside it, the way every linter does. */
function resolveManifest(input: string): string {
  try {
    if (statSync(input).isDirectory()) return join(input, 'CAP.md')
  } catch {
    // Fall through: a missing path is reported when we try to read it, with a
    // better message than a stat error would give.
  }
  return input
}

/** The package name beside the manifest, so a mismatch can be caught. */
function siblingPackageName(manifestPath: string): string | undefined {
  const dir = manifestPath.replace(/[^/\\]*$/, '') || '.'
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      name?: string
    }
    return pkg.name
  } catch {
    return undefined
  }
}

function runCompile(file: string, target: Target): number {
  let source: string
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    console.error(`cannot read ${file}`)
    return 2
  }
  const parsed = parse(source)
  if (!parsed.ok) {
    for (const e of parsed.errors)
      console.error(`${file}:${e.line}  ${e.message}`)
    return 1
  }
  // Straight to stdout with nothing around it, so the output can be piped
  // into the file it belongs in.
  process.stdout.write(compile(parsed.manifest, target))
  return 0
}

function runReview(dir: string, json: boolean): number {
  const found = discover(dir)
  const result = review(found, siblingPackageName(join(dir, 'CAP.md')))

  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return result.findings.length === 0 ? 0 : 1
  }

  console.log(`${result.plugin ?? dir}`)
  if (result.source) console.log(`  manifest: ${result.source}`)

  if (result.grants.length > 0) {
    console.log('  grants:')
    for (const g of result.grants) {
      const mark = g.highRisk ? '!' : ' '
      console.log(`   ${mark} ${g.capability.padEnd(18)} ${g.summary}`)
    }
  }
  if (result.forbids.length > 0) {
    console.log(`  forbids: ${result.forbids.join(', ')}`)
  }
  // The rationale is prose the author wrote for a human; a review that hid it
  // would be asking someone to judge a grant list with the reasons stripped out.
  if (result.manifest?.prose) {
    console.log('\n  rationale:')
    for (const line of result.manifest.prose.split('\n'))
      console.log(`    ${line}`)
  }

  if (result.findings.length > 0) {
    console.log('')
    for (const f of result.findings) {
      console.log(`  ${f.severity.padEnd(7)} ${f.rule.padEnd(28)} ${f.message}`)
    }
  }

  if (shouldRefuse(result)) {
    console.log('\nDo not install unattended: the manifest has errors.')
  }
  return result.findings.length === 0 ? 0 : 1
}

function report(output: Output, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(output, null, 2))
    return
  }
  if (output.findings.length === 0) {
    console.log(`${output.file}: clean`)
    return
  }
  for (const f of output.findings) {
    console.log(
      `${output.file}:${f.line}  ${f.severity.padEnd(7)} ${f.rule.padEnd(28)} ${f.message}`,
    )
  }
  const errors = output.findings.filter((f) => f.severity === 'error').length
  const warnings = output.findings.length - errors
  console.log(`\n${errors} error(s), ${warnings} warning(s)`)
}

export function main(argv: readonly string[]): number {
  const json = argv.includes('--json')

  // Strip flags and their values so the positional arguments keep their
  // positions whether or not a flag was passed, and wherever it was passed.
  const args: string[] = []
  let target: string | undefined
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string
    if (arg === '--json') continue
    if (arg === '--target') {
      target = argv[i + 1]
      i += 1
      continue
    }
    args.push(arg)
  }

  if (args.includes('-h') || args.includes('--help') || args.length === 0) {
    console.log(USAGE)
    return args.length === 0 ? 2 : 0
  }

  const [command, positional] = args

  if (command === 'compile') {
    if (target === undefined || !TARGETS.includes(target as Target)) {
      console.error(`capmark compile needs --target <${TARGETS.join('|')}>`)
      return 2
    }
    return runCompile(resolveManifest(positional ?? 'CAP.md'), target as Target)
  }

  if (command === 'review') {
    if (positional === undefined) {
      console.error('capmark review needs a plugin directory')
      return 2
    }
    return runReview(positional, json)
  }

  if (command !== 'lint') {
    console.error(`unknown command \`${command}\`\n\n${USAGE}`)
    return 2
  }

  const file = resolveManifest(positional ?? 'CAP.md')
  let source: string
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    console.error(`cannot read ${file}`)
    return 2
  }

  const parsed = parse(source)
  if (!parsed.ok) {
    report(
      {
        file,
        ok: false,
        findings: parsed.errors.map((e) => ({
          rule: 'parse',
          severity: 'error',
          line: e.line,
          message: e.message,
        })),
      },
      json,
    )
    return 1
  }

  const findings = lint(parsed.manifest, siblingPackageName(file))
  report({ file, ok: !hasErrors(findings), findings: [...findings] }, json)
  return findings.length === 0 ? 0 : 1
}
