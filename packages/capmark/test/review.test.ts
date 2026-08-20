import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discover } from '../src/discover.ts'
import { review, shouldRefuse } from '../src/review.ts'

function pkg(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'capmark-review-'))
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(dir, name), body)
  return dir
}

const READER = `---
capmark: 0.1
plugin: reader
---
\`\`\`cap
grant fs:read
never proc:spawn
\`\`\`

Reads files in the workspace. Never runs a shell.
`

const GREEDY = `---
capmark: 0.1
plugin: greedy
---
\`\`\`cap
grant proc:spawn
grant credentials:read
\`\`\`

Runs the project's own build and reads its registry token.
`

describe('review', () => {
  it('lists what a plugin asks for, with a summary per capability', () => {
    const r = review(discover(pkg({ 'CAP.md': READER })), 'reader')
    expect(r.plugin).toBe('reader')
    expect(r.grants.map((g) => g.capability)).toEqual(['fs:read'])
    expect(r.grants[0]?.summary).toContain('Read files')
    expect(r.forbids).toEqual(['proc:spawn'])
    expect(r.findings).toEqual([])
  })

  it('keeps the author rationale, since a grant list without reasons is unreadable', () => {
    const r = review(discover(pkg({ 'CAP.md': READER })), 'reader')
    expect(r.manifest?.prose).toContain('Never runs a shell')
  })

  it('marks the grants that hand over broad control', () => {
    const r = review(discover(pkg({ 'CAP.md': GREEDY })), 'greedy')
    expect(r.grants.every((g) => g.highRisk)).toBe(true)
    expect(r.findings.some((f) => f.rule === 'high-risk-grant')).toBe(true)
  })

  it('reports a missing manifest without deciding what that means', () => {
    const r = review(discover(pkg({})), 'mystery')
    expect(r.findings.map((f) => f.rule)).toEqual(['no-manifest'])
    // Absent is a warning, not an error: whether it is acceptable depends on
    // the deployment, so the caller decides.
    expect(shouldRefuse(r)).toBe(false)
  })

  it('treats an unparseable manifest as worse than none', () => {
    const r = review(discover(pkg({ 'CAP.md': '# nope\n' })), 'broken')
    expect(r.findings[0]?.rule).toBe('unreadable-manifest')
    expect(shouldRefuse(r)).toBe(true)
  })

  it('catches a manifest naming a package other than the one being installed', () => {
    const r = review(discover(pkg({ 'CAP.md': READER })), 'something-else')
    expect(r.findings.some((f) => f.rule === 'plugin-name-mismatch')).toBe(true)
    expect(shouldRefuse(r)).toBe(true)
  })

  it('reads a manifest from the Agent Plugins extensions slot', () => {
    const dir = pkg({
      'package.json': JSON.stringify({
        name: 'reader',
        extensions: { 'dev.capmark': { manifest: READER } },
      }),
    })
    expect(
      review(discover(dir), 'reader').grants.map((g) => g.capability),
    ).toEqual(['fs:read'])
  })
})

describe('the Agent Plugins extensions slot', () => {
  it('ignores a bare string, which the 1.0.0 spec does not permit', () => {
    // Extension member values MUST be objects. Accepting a string would make
    // capmark the reason a non-conformant manifest appeared to work.
    const dir = pkg({
      'package.json': JSON.stringify({
        name: 'reader',
        extensions: { 'dev.capmark': READER },
      }),
    })
    expect(discover(dir).kind).toBe('absent')
  })

  it('ignores an array, which is an object to typeof but not to the spec', () => {
    const dir = pkg({
      'package.json': JSON.stringify({
        name: 'reader',
        extensions: { 'dev.capmark': [READER] },
      }),
    })
    expect(discover(dir).kind).toBe('absent')
  })
})
