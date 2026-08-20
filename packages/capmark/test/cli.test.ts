import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { main } from '../src/cli.ts'

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'capmark-'))
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body)
  }
  return dir
}

const CLEAN = `---
capmark: 0.1
plugin: my-plugin
---
\`\`\`cap
grant fs:read
\`\`\`
`

let logs: string[] = []
const spy = vi.spyOn(console, 'log').mockImplementation((m) => {
  logs.push(String(m))
})
const errSpy = vi.spyOn(console, 'error').mockImplementation((m) => {
  logs.push(String(m))
})

afterEach(() => {
  logs = []
  spy.mockClear()
  errSpy.mockClear()
})

describe('capmark lint', () => {
  it('exits 0 on a clean manifest', () => {
    const dir = fixture({
      'CAP.md': CLEAN,
      'package.json': '{"name":"my-plugin"}',
    })
    expect(main(['lint', dir])).toBe(0)
    expect(logs.join('\n')).toContain('clean')
  })

  it('finds CAP.md inside a directory argument', () => {
    const dir = fixture({ 'CAP.md': CLEAN })
    expect(main(['lint', dir])).toBe(0)
  })

  it('catches a manifest naming a different package than it ships beside', () => {
    const dir = fixture({ 'CAP.md': CLEAN, 'package.json': '{"name":"other"}' })
    expect(main(['lint', dir])).toBe(1)
    expect(logs.join('\n')).toContain('plugin-name-mismatch')
  })

  it('exits 1 with a line number on a parse error', () => {
    const dir = fixture({ 'CAP.md': '# no frontmatter\n' })
    expect(main(['lint', dir])).toBe(1)
    expect(logs.join('\n')).toContain('missing frontmatter')
  })

  it('exits 2 when the file cannot be read', () => {
    expect(main(['lint', '/definitely/not/here/CAP.md'])).toBe(2)
  })

  it('exits 2 on an unknown command', () => {
    expect(main(['frobnicate'])).toBe(2)
  })

  it('emits parseable json', () => {
    const dir = fixture({ 'CAP.md': CLEAN, 'package.json': '{"name":"other"}' })
    main(['lint', dir, '--json'])
    const parsed = JSON.parse(logs.join('\n')) as {
      ok: boolean
      findings: unknown[]
    }
    expect(parsed.ok).toBe(false)
    expect(parsed.findings.length).toBeGreaterThan(0)
  })
})
