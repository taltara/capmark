import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { measureMask, planMask } from '../src/mask.ts'
import { parse } from '../src/parse.ts'

/**
 * The offline mask compiler has to agree with the harness.
 *
 * This fixture is a live capture: for each agent preset, the schemas before a
 * `tools.restrict()` call and the tool names visible after it, taken from a
 * booted `@deepseek-ai/dsh` 0.1.0-rc.7. If `planMask` and the registry ever
 * disagree, every number capmark publishes is fiction — so this compares them
 * directly rather than checking the compiler against itself.
 */
const LIVE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures-rc7-live-mask.json', import.meta.url)),
    'utf8',
  ),
) as {
  presets: {
    preset: string
    before?: { count: number; schemas: { name: string }[] }
    after?: { count: number; names: string[] }
    afterBytes?: number
  }[]
}

/** The manifest the capture was taken with: fs:read plus net:fetch. */
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

describe('planMask reproduces what the harness actually did', () => {
  for (const entry of LIVE.presets) {
    if (!entry.before || !entry.after) continue

    it(`agrees with the registry on the ${entry.preset} preset`, () => {
      const registered = entry.before?.schemas.map((s) => s.name) ?? []
      const plan = planMask(MANIFEST, registered)
      // Order differs between the registry view and registration order; the
      // set is what has to match.
      expect(new Set(plan.kept)).toEqual(new Set(entry.after?.names ?? []))
    })

    it(`predicts the ${entry.preset} payload the harness produced`, () => {
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

  it('never names an unmaskable tool in the restriction it emits', () => {
    const withCodeMode = LIVE.presets.find((p) => p.preset === 'code')
    const registered = withCodeMode?.before?.schemas.map((s) => s.name) ?? []
    expect(registered).toContain('run_code')
    const plan = planMask(MANIFEST, registered)
    // restrict() throws on this name rather than ignoring it.
    expect(plan.mask.allow).not.toContain('run_code')
    // ...but it stays visible, so the saving must not pretend otherwise.
    expect(plan.kept).toContain('run_code')
  })
})
