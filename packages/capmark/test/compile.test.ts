import { describe, expect, it } from 'vitest'
import { compile, TARGETS } from '../src/compile.ts'
import { parse } from '../src/parse.ts'

const SOURCE = `---
capmark: 0.1
plugin: reader
---

# Capabilities

\`\`\`cap
grant fs:read scope=workspace
grant net:fetch
\`\`\`

# Contracts

\`\`\`cap
never proc:spawn
\`\`\`

# Rationale

Reads the workspace and calls one host.
`

function manifest() {
  const result = parse(SOURCE)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.manifest
}

describe('compile', () => {
  it('embeds the manifest exactly as written, not a reconstruction', () => {
    // Rebuilding it moved every directive into one block and left the headings
    // standing over nothing, so what ships must be the original bytes.
    expect(manifest().source).toBe(SOURCE)
    expect(compile(manifest(), 'dsh')).toContain('# Capabilities')
    expect(compile(manifest(), 'dsh')).toContain('# Contracts')
  })

  it('emits a dsh row that re-parses to the same manifest', () => {
    const yaml = compile(manifest(), 'dsh')
    // Pull the block scalar back out and check it survived indentation.
    const body = yaml.slice(
      yaml.indexOf('manifest: |') + 'manifest: |\n'.length,
    )
    const dedented = body
      .split('\n')
      .map((l) => (l.startsWith('          ') ? l.slice(10) : l))
      .join('\n')
    const round = parse(dedented)
    expect(round.ok).toBe(true)
    if (!round.ok) return
    expect(round.manifest.plugin).toBe('reader')
    expect(round.manifest.grants.map((g) => g.capability)).toEqual([
      'fs:read',
      'net:fetch',
    ])
    expect(round.manifest.nevers.map((n) => n.capability)).toEqual([
      'proc:spawn',
    ])
  })

  it('names the gate package and enables the row it emits', () => {
    const yaml = compile(manifest(), 'dsh')
    expect(yaml).toContain('name: dsh-capmark-gate')
    expect(yaml).toContain('strict: true')
    expect(yaml).not.toContain('disabled: true')
  })

  it('puts agent-plugins data under a reverse-domain key whose value is an object', () => {
    const json = JSON.parse(compile(manifest(), 'agent-plugins')) as {
      extensions: Record<string, unknown>
    }
    const slot = json.extensions['dev.capmark']
    // The 1.0.0 spec requires extension member values to be objects. A bare
    // string is a conformance violation that no client is obliged to report,
    // so nothing would tell us at runtime.
    expect(typeof slot).toBe('object')
    expect(Array.isArray(slot)).toBe(false)
    expect(typeof (slot as { manifest?: unknown }).manifest).toBe('string')
  })

  it('round-trips through the agent-plugins slot', () => {
    const json = JSON.parse(compile(manifest(), 'agent-plugins')) as {
      extensions: { 'dev.capmark': { manifest: string } }
    }
    const round = parse(json.extensions['dev.capmark'].manifest)
    expect(round.ok).toBe(true)
  })

  it('compiles grants into the skill spec allowed-tools field', () => {
    const out = compile(manifest(), 'skill')
    const line =
      out.split('\n').find((l) => l.startsWith('allowed-tools:')) ?? ''
    const tools = line.replace('allowed-tools:', '').trim().split(' ')
    expect(tools).toContain('read')
    expect(tools).toContain('web_search')
    expect(tools).not.toContain('bash')
  })

  it('keeps skill metadata values as strings, per the spec map type', () => {
    const out = compile(manifest(), 'skill')
    for (const line of out.split('\n')) {
      if (!line.startsWith('  dev.capmark.')) continue
      expect(line).toMatch(/: ".*"$/)
    }
  })

  it('says out loud that the skill fields are experimental or advisory', () => {
    const out = compile(manifest(), 'skill')
    expect(out).toContain('experimental')
    expect(out).toContain('advisory')
  })

  it('offers no mcp target, having no field to put one in', () => {
    expect(TARGETS).not.toContain('mcp')
  })
})
