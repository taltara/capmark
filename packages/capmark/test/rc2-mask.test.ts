import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { measureMask, planMask } from '../src/mask.ts'
import { parse } from '../src/parse.ts'

/**
 * A live capture from `@deepseek-ai/dsh` `0.1.1-rc.2`, taken the same way as the
 * rc.7 one: mask a real agent scope, then re-read the registry.
 *
 * Comparing package sources said the numbers would be unchanged, because the
 * preset row sets are identical and the three seam packages are byte-identical.
 * They are not unchanged: five tool packages edited their descriptions, and the
 * schema payload is what those descriptions are. Reasoning about the sources
 * got this wrong; booting it got it right.
 */
const LIVE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures-rc2-live-mask.json', import.meta.url)),
    'utf8',
  ),
) as {
  presets: {
    preset: string
    before?: { count: number; schemas: { name: string }[] }
    after?: { names: string[] }
    afterBytes?: number
  }[]
}

const MANIFEST = (() => {
  const result = parse(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant fs:read
grant net:fetch
\`\`\`

Reads the workspace and calls a hosted model.
`)
  if (!result.ok) throw new Error('fixture manifest did not parse')
  return result.manifest
})()

describe('planMask reproduces what rc.2 actually did', () => {
  for (const entry of LIVE.presets) {
    if (!entry.before || !entry.after) continue
    it(`agrees with the rc.2 registry on ${entry.preset}`, () => {
      const registered = entry.before?.schemas.map((s) => s.name) ?? []
      expect(new Set(planMask(MANIFEST, registered).kept)).toEqual(
        new Set(entry.after?.names ?? []),
      )
    })
    it(`predicts the rc.2 ${entry.preset} payload`, () => {
      const schemas = entry.before?.schemas ?? []
      const saving = measureMask(
        schemas,
        planMask(
          MANIFEST,
          schemas.map((s) => s.name),
        ),
      )
      expect(saving.afterBytes).toBe(entry.afterBytes)
    })
  }
})

/** The figures the rc.2 row of the README quotes. */
describe('the rc.2 numbers we publish', () => {
  const rows = [
    { id: 'standard', before: 25965, after: 3122, cut: '88.0' },
    { id: 'code', before: 26908, after: 4065, cut: '84.9' },
    { id: 'cordis', before: 33453, after: 3122, cut: '90.7' },
  ] as const

  for (const row of rows) {
    it(`${row.id} is exactly what the readme says`, () => {
      const schemas =
        LIVE.presets.find((p) => p.preset === row.id)?.before?.schemas ?? []
      const saving = measureMask(
        schemas,
        planMask(
          MANIFEST,
          schemas.map((s) => s.name),
        ),
      )
      expect(saving.beforeBytes).toBe(row.before)
      expect(saving.afterBytes).toBe(row.after)
      expect((saving.savedFraction * 100).toFixed(1)).toBe(row.cut)
    })
  }
})
