/**
 * `capmark lint [path]` — check a manifest and say what is wrong with it.
 *
 * Zero dependencies and hand-rolled argument handling, because a linter that
 * plugin authors are meant to put in CI should not drag a tree of packages in
 * behind it. Exit codes are the contract: 0 clean, 1 findings, 2 misuse.
 */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { hasErrors, lint } from './lint.ts'
import { parse } from './parse.ts'

const USAGE = `capmark — capability manifests for agent plugins

Usage:
  capmark lint [path]     check a CAP.md (default: ./CAP.md)

Options:
  --json                  machine-readable findings on stdout
  -h, --help              show this help

Exit codes:
  0  clean
  1  errors or warnings found
  2  could not run (bad usage, unreadable file)
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
  const args = argv.filter((a) => a !== '--json')
  const json = argv.includes('--json')

  if (args.includes('-h') || args.includes('--help') || args.length === 0) {
    console.log(USAGE)
    return args.length === 0 ? 2 : 0
  }

  const [command, target] = args
  if (command !== 'lint') {
    console.error(`unknown command \`${command}\`\n\n${USAGE}`)
    return 2
  }

  const file = resolveManifest(target ?? 'CAP.md')
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
