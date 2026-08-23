/**
 * Runs `capmark infer` across published DSH plugins and reports the aggregate.
 *
 * The output is deliberately aggregate. What a plugin reaches for is not a
 * charge against it — a supply-chain scanner that reads files is doing its job,
 * and every package here is doing something reasonable. The finding is that
 * none of them can tell you so without you reading their source, which is a gap
 * in the ecosystem rather than a fault in any package.
 *
 *   node scripts/audit.mjs            # fetch and audit
 *   node scripts/audit.mjs --json     # machine-readable
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discover, infer } from '../packages/capmark/src/index.ts'

/** Published on npm, from the Security & Governance and adjacent sections. */
const PACKAGES = [
  'dsh-auto-review',
  'dsh-blueprint',
  'dsh-budget',
  'dsh-capmark-gate',
  'dsh-defend',
  'dsh-dep-audit',
  'dsh-guardian',
  'dsh-mask',
  'dsh-overlay-check',
  'dsh-permission-rules',
  'dsh-plugin-verify',
  'dsh-poison-guard',
  'dsh-safeguard',
  'dsh-telemetry-redactor',
  'dsh-tool-search',
  'dsh-yolo-mode',
]

const json = process.argv.includes('--json')
const work = mkdtempSync(join(tmpdir(), 'capmark-audit-'))
const rows = []

for (const name of PACKAGES) {
  const dir = join(work, name)
  try {
    execFileSync('npm', ['pack', name, '--pack-destination', work], {
      stdio: 'ignore',
    })
  } catch {
    // Not every listed plugin publishes to npm; some are GitHub-only.
    rows.push({ name, fetched: false })
    continue
  }
  const tarball = readdirSync(work).find(
    (f) => f.startsWith(name) && f.endsWith('.tgz'),
  )
  if (!tarball) {
    rows.push({ name, fetched: false })
    continue
  }
  execFileSync('mkdir', ['-p', dir])
  execFileSync('tar', [
    '-xzf',
    join(work, tarball),
    '-C',
    dir,
    '--strip-components=1',
  ])

  const inference = infer(dir)
  const manifest = discover(dir)
  rows.push({
    name,
    fetched: true,
    filesScanned: inference.filesScanned,
    hasManifest: manifest.kind === 'found',
    grants: inference.proposed.map((p) => p.capability),
    builtins: inference.builtins,
    uncovered: inference.unmapped,
  })
}

rmSync(work, { recursive: true, force: true })

const audited = rows.filter((r) => r.fetched)
const summary = {
  audited: audited.length,
  unfetchable: rows.length - audited.length,
  withManifest: audited.filter((r) => r.hasManifest).length,
  readFilesystem: audited.filter((r) => r.grants.includes('fs:read')).length,
  reachNetwork: audited.filter((r) => r.grants.includes('net:fetch')).length,
  needNothing: audited.filter((r) => r.grants.length === 0).length,
}

if (json) {
  console.log(JSON.stringify({ summary, rows }, null, 2))
} else {
  console.log(`audited          ${summary.audited}`)
  console.log(`ship a CAP.md    ${summary.withManifest}`)
  console.log(`read the disk    ${summary.readFilesystem}`)
  console.log(`reach the net    ${summary.reachNetwork}`)
  console.log(`need nothing     ${summary.needNothing}`)
  console.log()
  for (const r of audited) {
    console.log(
      `  ${r.name.padEnd(24)} ${String(r.filesScanned).padStart(2)}f  ${r.grants.join(', ') || '-'}`,
    )
  }
}
