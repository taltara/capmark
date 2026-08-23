import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { draft, infer, readInjects } from '../src/infer.ts'
import { parse } from '../src/parse.ts'

function pkg(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'capmark-infer-'))
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return dir
}

describe('readInjects', () => {
  it('reads a plain declaration', () => {
    expect(readInjects('export const inject = ["tools", "shell"]')).toEqual([
      'shell',
      'tools',
    ])
  })

  it('reads the object-property form too', () => {
    expect(readInjects('{ name: "x", inject: [\'fs\'] }')).toEqual(['fs'])
  })

  it('ignores code that manipulates an inject array rather than declaring one', () => {
    // Real false positive from dsh-blueprint's YAML emitter: a looser reader
    // pulled `", "` out of this and offered it as a service name.
    const source =
      'inject: [${row.inject.map((item) => emitScalar(item)).join(", ")}]'
    expect(readInjects(source)).toEqual([])
  })

  it('ignores package specifiers, which are client-bundle deps not host services', () => {
    expect(
      readInjects('inject = ["@deepseek-ai/dsh-client-ui-slots", "tools"]'),
    ).toEqual(['tools'])
  })
})

describe('infer', () => {
  it('proposes a capability from the service that grants it', () => {
    const dir = pkg({
      'package.json': '{"name":"runner"}',
      'lib/index.js': 'export const inject = ["shell", "tools"]',
    })
    const result = infer(dir)
    expect(result.plugin).toBe('runner')
    expect(result.proposed.map((p) => p.capability)).toEqual(['proc:spawn'])
    expect(result.proposed[0]?.evidence).toContain('shell')
  })

  it('proposes nothing for a plugin that only registers tools', () => {
    // dsh-poison-guard is exactly this: injects `tools`, grants nothing.
    const dir = pkg({
      'package.json': '{"name":"scanner"}',
      'lib/index.js': 'const inject = ["tools"];',
    })
    expect(infer(dir).proposed).toEqual([])
  })

  it('names services that carry authority no capability covers', () => {
    const dir = pkg({
      'package.json': '{"name":"boxed"}',
      'lib/index.js': 'const inject = ["sandbox", "approval"];',
    })
    const result = infer(dir)
    expect(result.proposed).toEqual([])
    // Silence here would read as approval; it has to be reported.
    expect(result.unmapped).toEqual(['approval', 'sandbox'])
  })

  it('skips the browser half, whose services carry no host authority', () => {
    const dir = pkg({
      'package.json': '{"name":"ui"}',
      'lib/index.js': 'const inject = ["loader"];',
      'lib/client.js':
        'window.__ModuleLoader__.load({ id: "ui" }); const inject = ["slots"];',
    })
    const result = infer(dir)
    expect(result.injects).toEqual(['loader'])
    expect(result.filesScanned).toBe(1)
  })

  it('distinguishes "read nothing" from "declares nothing"', () => {
    const empty = infer(pkg({ 'package.json': '{"name":"unbuilt"}' }))
    expect(empty.filesScanned).toBe(0)
    expect(draft(empty)).toContain('NOTHING WAS READ')

    const declared = infer(
      pkg({
        'package.json': '{"name":"quiet"}',
        'lib/index.js': 'const inject = ["tools"];',
      }),
    )
    expect(declared.filesScanned).toBe(1)
    expect(draft(declared)).not.toContain('NOTHING WAS READ')
  })
})

describe('draft', () => {
  it('emits a manifest that parses', () => {
    const dir = pkg({
      'package.json': '{"name":"runner"}',
      'lib/index.js': 'const inject = ["shell", "credentials"];',
    })
    const result = parse(draft(infer(dir)))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.manifest.plugin).toBe('runner')
    expect(result.manifest.grants.map((g) => g.capability).sort()).toEqual([
      'credentials:read',
      'proc:spawn',
    ])
  })

  it('says it is a draft, in a comment that survives into the committed file', () => {
    const out = draft(
      infer(pkg({ 'package.json': '{"name":"x"}', 'lib/index.js': 'x' })),
    )
    expect(out).toContain('DRAFT')
    expect(out).toContain('Review every line')
  })

  it('carries the evidence for each grant, so an author can disagree with it', () => {
    const dir = pkg({
      'package.json': '{"name":"runner"}',
      'lib/index.js': 'const inject = ["shell"];',
    })
    expect(draft(infer(dir))).toContain('# injects `shell`')
  })
})
