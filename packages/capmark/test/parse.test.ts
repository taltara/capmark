import { describe, expect, it } from 'vitest'
import { hasErrors, lint } from '../src/lint.ts'
import { parse } from '../src/parse.ts'
import { capabilityForTool, unclaimedTools } from '../src/vocabulary.ts'

const GOOD = `---
capmark: 0.1
plugin: dsh-vision-toolkit
---

# Capabilities

\`\`\`cap
grant fs:read scope=workspace
grant net:fetch
\`\`\`

# Contracts

\`\`\`cap
never proc:spawn
require approval for fs:read
\`\`\`

# Rationale

Vision OCR reads images and calls two hosts. No shell.
`

function ok(source: string) {
  const result = parse(source)
  if (!result.ok)
    throw new Error(
      `expected parse to succeed: ${JSON.stringify(result.errors)}`,
    )
  return result.manifest
}

function fail(source: string) {
  const result = parse(source)
  if (result.ok) throw new Error('expected parse to fail')
  return result.errors
}

describe('parse', () => {
  it('reads grants, nevers, approvals and prose', () => {
    const manifest = ok(GOOD)
    expect(manifest.plugin).toBe('dsh-vision-toolkit')
    expect(manifest.grants.map((g) => g.capability)).toEqual([
      'fs:read',
      'net:fetch',
    ])
    expect(manifest.grants[0]?.scope).toBe('workspace')
    expect(manifest.nevers.map((n) => n.capability)).toEqual(['proc:spawn'])
    expect(manifest.approvals.map((a) => a.capability)).toEqual(['fs:read'])
    expect(manifest.prose).toContain('Vision OCR reads images')
  })

  it('keeps prose out of the directive set and directives out of the prose', () => {
    const manifest = ok(GOOD)
    expect(manifest.prose).not.toContain('grant fs:read')
  })

  it('reports the line a bad directive is on, in the original file', () => {
    const errors = fail(`---
capmark: 0.1
plugin: p
---

\`\`\`cap
allow fs:read
\`\`\`
`)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.line).toBe(7)
  })

  it('rejects an unknown capability rather than ignoring it', () => {
    const errors = fail(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant fs:destroy
\`\`\`
`)
    expect(errors[0]?.message).toContain('unknown capability')
  })

  it('rejects an unknown scope on a capability with a closed scope list', () => {
    const errors = fail(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant fs:read scope=everywhere
\`\`\`
`)
    expect(errors[0]?.message).toContain('unknown scope')
  })

  it('rejects a scope on a capability that takes none', () => {
    const errors = fail(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant proc:spawn scope=workspace
\`\`\`
`)
    expect(errors[0]?.message).toContain('takes no scope')
  })

  it('requires frontmatter', () => {
    expect(fail('# just markdown\n')[0]?.message).toContain(
      'missing frontmatter',
    )
  })

  it('rejects a schema version it cannot read', () => {
    const errors = fail(`---
capmark: 9.9
plugin: p
---
`)
    expect(errors[0]?.message).toContain('unsupported schema version')
  })

  it('catches an unterminated cap block instead of silently dropping it', () => {
    const errors = fail(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant fs:read
`)
    expect(errors.some((e) => e.message.includes('unterminated'))).toBe(true)
  })

  it('ignores comments and blank lines inside a cap block', () => {
    const manifest = ok(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
# why we need this

grant fs:read
\`\`\`
`)
    expect(manifest.grants).toHaveLength(1)
  })

  it('ignores fenced blocks that are not cap blocks', () => {
    const manifest = ok(`---
capmark: 0.1
plugin: p
---
\`\`\`sh
grant fs:read
\`\`\`

\`\`\`cap
grant fs:write
\`\`\`
`)
    expect(manifest.grants.map((g) => g.capability)).toEqual(['fs:write'])
  })
})

describe('lint', () => {
  it('passes a manifest that says what it means', () => {
    expect(lint(ok(GOOD), 'dsh-vision-toolkit')).toHaveLength(0)
  })

  it('errors when the manifest names a different package than it ships in', () => {
    const findings = lint(ok(GOOD), 'some-other-package')
    expect(findings.some((f) => f.rule === 'plugin-name-mismatch')).toBe(true)
    expect(hasErrors(findings)).toBe(true)
  })

  it('refuses to guess when a capability is both granted and forbidden', () => {
    const findings = lint(
      ok(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant fs:read
never fs:read
\`\`\`
`),
    )
    expect(findings.some((f) => f.rule === 'grant-never-conflict')).toBe(true)
    expect(hasErrors(findings)).toBe(true)
  })

  it('flags a duplicate grant', () => {
    const findings = lint(
      ok(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant fs:read
grant fs:read
\`\`\`
`),
    )
    expect(findings.some((f) => f.rule === 'duplicate-grant')).toBe(true)
  })

  it('warns that an approval on an ungranted capability never fires', () => {
    const findings = lint(
      ok(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant fs:read
require approval for proc:spawn
\`\`\`
`),
    )
    expect(findings.some((f) => f.rule === 'approval-without-grant')).toBe(true)
    expect(hasErrors(findings)).toBe(false)
  })

  it('warns that a net:fetch scope is not a boundary', () => {
    const findings = lint(
      ok(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant net:fetch scope=api.example.com
\`\`\`

Fetches from one host.
`),
    )
    const advisory = findings.find((f) => f.rule === 'advisory-scope')
    expect(advisory?.message).toContain('nothing enforces it')
  })

  it('asks for a reason before handing over the shell', () => {
    const findings = lint(
      ok(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant proc:spawn
\`\`\`
`),
    )
    expect(findings.some((f) => f.rule === 'unexplained-high-risk-grant')).toBe(
      true,
    )
  })

  it('accepts a high-risk grant once it is explained', () => {
    const findings = lint(
      ok(`---
capmark: 0.1
plugin: p
---
\`\`\`cap
grant proc:spawn
\`\`\`

Runs the project's own test command, and nothing else.
`),
    )
    expect(findings.some((f) => f.rule === 'unexplained-high-risk-grant')).toBe(
      false,
    )
  })

  it('warns that an empty grant set denies everything', () => {
    const findings = lint(
      ok(`---
capmark: 0.1
plugin: p
---
`),
    )
    expect(findings.some((f) => f.rule === 'empty-grant-set')).toBe(true)
  })
})

describe('vocabulary', () => {
  it('maps a real rc.7 tool to the capability that covers it', () => {
    expect(capabilityForTool('bash')?.id).toBe('proc:spawn')
    expect(capabilityForTool('cordis_define')?.id).toBe('plugins:manage')
    expect(capabilityForTool('grep')?.id).toBe('fs:read')
  })

  it('names tools no capability claims, rather than defaulting either way', () => {
    expect(unclaimedTools(['bash', 'ralph', 'read'])).toEqual(['ralph'])
  })
})
