import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { measureMask, planMask } from '../src/mask.ts'
import { parse } from '../src/parse.ts'

/**
 * Captured from a booted `@deepseek-ai/dsh` 0.1.0-rc.7 web profile via
 * `packages/probe`, one entry per agent preset. Real schemas, so the numbers
 * these tests assert are the numbers a real request would carry.
 */
const CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures-rc7-presets.json', import.meta.url)),
    'utf8',
  ),
) as {
  presets: { preset: string; count?: number; schemas?: { name: string }[] }[]
}

function preset(id: string) {
  const found = CAPTURE.presets.find((p) => p.preset === id)
  if (!found?.schemas)
    throw new Error(`fixture has no schemas for preset ${id}`)
  return found.schemas
}

function manifestOf(source: string) {
  const result = parse(source)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.manifest
}

const READ_ONLY = manifestOf(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant fs:read scope=workspace
grant net:fetch
\`\`\`

Reads the workspace and calls one hosted model.
`)

describe('planMask against a real rc.7 preset', () => {
  it('drops the shell, code runner, and plugin control from a read-only plugin', () => {
    const plan = planMask(
      READ_ONLY,
      preset('standard').map((s) => s.name),
    )
    expect(plan.dropped).toContain('bash')
    expect(plan.dropped).toContain('write')
    expect(plan.dropped).toContain('subagent')
    expect(plan.kept).toContain('read')
    expect(plan.kept).toContain('grep')
    expect(plan.kept).toContain('web_search')
  })

  it('keeps a tool the vocabulary does not claim, and says so', () => {
    const plan = planMask(READ_ONLY, ['read', 'some_third_party_tool'])
    // Never remove a tool merely because capmark has not learned it — that
    // would break a working agent to enforce a rule nobody wrote.
    expect(plan.kept).toContain('some_third_party_tool')
    expect(plan.unclaimed).toEqual(['some_third_party_tool'])
  })

  it('a never overrides a grant that would otherwise cover the tool', () => {
    const manifest = manifestOf(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant fs:read
grant fs:write
never fs:write
\`\`\`
`)
    const plan = planMask(
      manifest,
      preset('standard').map((s) => s.name),
    )
    expect(plan.kept).toContain('read')
    expect(plan.dropped).toContain('write')
  })
})

describe('measureMask', () => {
  it('reports a real reduction on the default preset', () => {
    const schemas = preset('standard')
    const saving = measureMask(
      schemas,
      planMask(
        READ_ONLY,
        schemas.map((s) => s.name),
      ),
    )
    expect(saving.beforeCount).toBe(25)
    expect(saving.afterCount).toBeLessThan(saving.beforeCount)
    expect(saving.savedBytes).toBeGreaterThan(0)
    // Guards the headline claim: if this ever drops below half, the pitch is
    // wrong and the test should say so before a README does.
    expect(saving.savedFraction).toBeGreaterThan(0.5)
  })

  it('saves nothing when the manifest grants everything registered', () => {
    const schemas = preset('minimal')
    const all = manifestOf(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant proc:spawn
grant fs:write
\`\`\`

Runs the project's build.
`)
    const saving = measureMask(
      schemas,
      planMask(
        all,
        schemas.map((s) => s.name),
      ),
    )
    expect(saving.savedBytes).toBe(0)
    expect(saving.savedFraction).toBe(0)
  })
})

describe('an empty mask is a mismatch, not a result', () => {
  it('flags a manifest that leaves a preset with nothing to call', () => {
    const schemas = preset('minimal')
    const plan = planMask(
      READ_ONLY,
      schemas.map((s) => s.name),
    )
    expect(plan.kept).toEqual([])
    expect(plan.empty).toBe(true)
  })

  it('does not flag a mask that keeps something', () => {
    const schemas = preset('standard')
    expect(
      planMask(
        READ_ONLY,
        schemas.map((s) => s.name),
      ).empty,
    ).toBe(false)
  })
})
