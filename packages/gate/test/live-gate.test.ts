import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'capmark'
import { describe, expect, it } from 'vitest'
import { policyFor } from '../src/enforce.ts'

/**
 * Captured from a booted `@deepseek-ai/dsh` 0.1.0-rc.7: the gate masked a live
 * `standard` agent and then drove real calls through the harness's own
 * `tools/pre-execute` waterfall.
 *
 * The unit tests above prove the policy against a fake registry, which is not
 * the same as proving the seam. This asserts the policy still produces the
 * verdicts the harness actually returned, so a refactor that quietly changes
 * what `deny` means fails here.
 */
const LIVE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures-rc7-live-gate.json', import.meta.url)),
    'utf8',
  ),
) as {
  beforeCount: number
  afterCount: number
  masked: string[]
  verdicts: Record<string, { kind: string }>
}

const MANIFEST = (() => {
  const result = parse(`---
capmark: 0.1
plugin: reader
---
\`\`\`cap
grant fs:read
never proc:spawn
\`\`\`

Reads files. Never runs a shell.
`)
  if (!result.ok) throw new Error('fixture manifest did not parse')
  return result.manifest
})()

describe('the verdicts a real harness returned', () => {
  const decide = policyFor(MANIFEST, { unclaimed: new Set() })

  for (const [tool, expected] of Object.entries(LIVE.verdicts)) {
    it(`still decides \`${tool}\` as ${expected.kind}`, () => {
      expect(decide({ tool }).kind).toBe(expected.kind)
    })
  }

  it('masked most of the default preset', () => {
    expect(LIVE.beforeCount).toBe(25)
    expect(LIVE.afterCount).toBe(4)
    expect(LIVE.masked).toContain('bash')
  })

  it('denied the shell through never, not merely through absence of a grant', () => {
    const d = decide({ tool: 'bash' })
    expect(d.kind === 'deny' && d.reason).toContain('never proc:spawn')
  })
})
