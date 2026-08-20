import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hasErrors, lint } from '../src/lint.ts'
import { parse } from '../src/parse.ts'

/** The example in the repo is a real manifest, so it has to hold up as one. */
describe('examples/CAP.md', () => {
  it('parses and lints clean', () => {
    const path = fileURLToPath(
      new URL('../../../examples/CAP.md', import.meta.url),
    )
    const result = parse(readFileSync(path, 'utf8'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const findings = lint(result.manifest, 'dsh-vision-toolkit')
    expect(hasErrors(findings)).toBe(false)
    // The unscoped net:fetch is deliberate; nothing should be shouting about it.
    expect(findings.map((f) => f.rule)).toEqual([])
  })
})
