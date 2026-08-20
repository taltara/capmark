/**
 * Prints what a manifest removes from a real request, per agent preset.
 *
 * Input is a capture from `packages/probe` against a booted profile, so every
 * figure here traces to schemas a harness actually assembled. Bytes are
 * measured; the token column is bytes/4 and is labelled as the estimate it is,
 * because the tokenizer belongs to the model provider and not to us.
 */

import { readFileSync } from 'node:fs'
import { measureMask, planMask } from '../src/mask.ts'
import { parse } from '../src/parse.ts'

interface Capture {
  defaultPreset: string
  presets: { preset: string; schemas?: { name: string }[]; error?: string }[]
}

const [capturePath, manifestPath] = process.argv.slice(2)
if (!capturePath || !manifestPath) {
  console.error('usage: report.ts <capture.json> <CAP.md>')
  process.exit(2)
}

const capture = JSON.parse(readFileSync(capturePath, 'utf8')) as Capture
const parsed = parse(readFileSync(manifestPath, 'utf8'))
if (!parsed.ok) {
  console.error('manifest did not parse:', parsed.errors)
  process.exit(1)
}

const pad = (s: string | number, n: number) => String(s).padStart(n)

console.log(`manifest: ${parsed.manifest.plugin}`)
console.log(
  `grants:   ${parsed.manifest.grants.map((g) => g.capability).join(', ') || '(none)'}`,
)
console.log()
console.log(
  'preset          tools        bytes   ->      bytes    saved   ~tokens saved',
)
console.log(
  '------------------------------------------------------------------------',
)

for (const entry of capture.presets) {
  if (!entry.schemas) {
    console.log(
      `${entry.preset.padEnd(14)} unavailable: ${entry.error ?? 'no schemas'}`,
    )
    continue
  }
  const names = entry.schemas.map((s) => s.name)
  const plan = planMask(parsed.manifest, names)
  const m = measureMask(entry.schemas, plan)
  const pct = `${(m.savedFraction * 100).toFixed(1)}%`
  console.log(
    `${entry.preset.padEnd(14)} ${pad(m.beforeCount, 2)} -> ${pad(m.afterCount, 2)} ${pad(m.beforeBytes, 8)} -> ${pad(m.afterBytes, 8)} ${pad(pct, 8)} ${pad(Math.round(m.savedBytes / 4), 9)}`,
  )
  if (plan.empty) {
    console.log(
      `${' '.repeat(14)} NOT A SAVING: this manifest leaves the preset with no callable tool.`,
    )
  }
  if (plan.unclaimed.length > 0) {
    console.log(
      `${' '.repeat(14)} unclaimed, kept: ${plan.unclaimed.join(', ')}`,
    )
  }
}
console.log()
console.log(
  'bytes are measured from the captured schema payload; tokens are bytes/4,',
)
console.log('an estimate — the real count depends on the provider tokenizer.')
