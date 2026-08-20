import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { measureMask, planMask } from '../src/mask.ts'
import { parse } from '../src/parse.ts'

interface Capture {
  presets: { preset: string; schemas?: { name: string }[] }[]
}

const CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures-rc7-presets.json', import.meta.url)),
    'utf8',
  ),
) as Capture

/** Exactly the three lines printed on assets/capmark-payload.png. */
const MANIFEST = (() => {
  const result = parse(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant fs:read
grant net:fetch
never proc:spawn
\`\`\`

Reads the workspace and calls one host.
`)
  if (!result.ok) throw new Error('image manifest did not parse')
  return result.manifest
})()

function schemasFor(id: string): { name: string }[] {
  const found = CAPTURE.presets.find((p) => p.preset === id)?.schemas
  if (!found) throw new Error(`fixture has no schemas for ${id}`)
  return found
}

/**
 * The launch image quotes numbers. If the code moves and the picture does not,
 * the picture becomes a false claim that nothing else in the suite would catch.
 */
describe('the numbers printed on the launch image', () => {
  const rows = [
    { id: 'standard', tools: 25, before: 25567, after: 2724, cut: '89.3' },
    { id: 'code', tools: 26, before: 26510, after: 3667, cut: '86.2' },
    { id: 'cordis', tools: 32, before: 33055, after: 2724, cut: '91.8' },
  ] as const

  for (const row of rows) {
    it(`the ${row.id} row is exactly what the image says`, () => {
      const schemas = schemasFor(row.id)
      const saving = measureMask(
        schemas,
        planMask(
          MANIFEST,
          schemas.map((s) => s.name),
        ),
      )
      expect(saving.beforeCount).toBe(row.tools)
      expect(saving.beforeBytes).toBe(row.before)
      expect(saving.afterBytes).toBe(row.after)
      expect((saving.savedFraction * 100).toFixed(1)).toBe(row.cut)
    })
  }

  it('leaves exactly the 5 tools the headline claims', () => {
    const schemas = schemasFor('standard')
    const plan = planMask(
      MANIFEST,
      schemas.map((s) => s.name),
    )
    expect(plan.kept).toHaveLength(5)
  })
})
