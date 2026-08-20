import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discover, parse } from 'capmark'
import { describe, expect, it } from 'vitest'
import { policyFor } from '../src/enforce.ts'
import {
  apply,
  type GateContext,
  gateAgent,
  type ToolsService,
} from '../src/index.ts'

function manifestOf(source: string) {
  const result = parse(source)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.manifest
}

const READ_ONLY = manifestOf(`---
capmark: 0.1
plugin: reader
---
\`\`\`cap
grant fs:read
never proc:spawn
require approval for fs:read
\`\`\`
`)

const NO_ASK = manifestOf(`---
capmark: 0.1
plugin: reader
---
\`\`\`cap
grant fs:read
\`\`\`
`)

const NONE = new Set<string>()

describe('policy', () => {
  it('allows a granted tool', () => {
    expect(policyFor(NO_ASK, { unclaimed: NONE })({ tool: 'read' }).kind).toBe(
      'allow',
    )
  })

  it('denies a tool no grant covers, and says which plugin', () => {
    const d = policyFor(NO_ASK, { unclaimed: NONE })({ tool: 'write' })
    expect(d.kind).toBe('deny')
    expect(d.kind === 'deny' && d.reason).toContain('reader')
  })

  it('lets never win over a grant that would otherwise cover the tool', () => {
    const both = manifestOf(`---
capmark: 0.1
plugin: reader
---
\`\`\`cap
grant proc:spawn
never proc:spawn
\`\`\`
`)
    const d = policyFor(both, { unclaimed: NONE })({ tool: 'bash' })
    expect(d.kind).toBe('deny')
  })

  it('asks rather than allows when the manifest requires approval', () => {
    const d = policyFor(READ_ONLY, { unclaimed: NONE })({ tool: 'read' })
    expect(d.kind).toBe('ask')
  })

  it('allows a tool no capability claims, instead of breaking a working agent', () => {
    const unclaimed = new Set(['third_party_tool'])
    expect(
      policyFor(NO_ASK, { unclaimed })({ tool: 'third_party_tool' }).kind,
    ).toBe('allow')
  })

  it('still denies an unclaimed-looking name that is actually claimed', () => {
    expect(
      policyFor(NO_ASK, { unclaimed: new Set(['bash']) })({ tool: 'bash' })
        .kind,
    ).toBe('deny')
  })
})

function fakeTools(names: string[]) {
  const calls: { allow?: string[] }[] = []
  const service: ToolsService = {
    schemas: () => names.map((name) => ({ name })),
    restrict: (filter) => {
      calls.push(filter)
      return () => undefined
    },
  }
  return { service, calls }
}

describe('gateAgent', () => {
  it('restricts the view to what the manifest justifies', () => {
    const { service, calls } = fakeTools(['read', 'grep', 'bash', 'write'])
    const report = gateAgent({ tools: service }, NO_ASK, [
      'read',
      'grep',
      'bash',
      'write',
    ])
    expect(calls).toHaveLength(1)
    expect(new Set(calls[0]?.allow)).toEqual(new Set(['read', 'grep']))
    expect(report.masked).toEqual(['bash', 'write'])
  })

  it('never names run_code in the restriction, because restrict() throws on it', () => {
    const { service, calls } = fakeTools(['read', 'bash', 'run_code'])
    const report = gateAgent({ tools: service }, NO_ASK, [
      'read',
      'bash',
      'run_code',
    ])
    expect(calls[0]?.allow).not.toContain('run_code')
    // ...and it stays visible, so the report must not claim it was removed.
    expect(report.masked).not.toContain('run_code')
    expect(report.kept).toContain('run_code')
  })

  it('does not call restrict when there is nothing to remove', () => {
    const { service, calls } = fakeTools(['read', 'grep'])
    gateAgent({ tools: service }, NO_ASK, ['read', 'grep'])
    expect(calls).toHaveLength(0)
  })

  it('refuses to mute an agent whose tools the manifest does not cover at all', () => {
    const { service } = fakeTools(['bash', 'write'])
    expect(() =>
      gateAgent({ tools: service }, NO_ASK, ['bash', 'write']),
    ).toThrow(/refusing to mask every tool/)
  })

  it('refuses the global view rather than reporting a mask it never applied', () => {
    const { service } = fakeTools([])
    expect(() => gateAgent({ tools: service }, NO_ASK, [])).toThrow(
      /not the global view/,
    )
  })
})

function fakeCtx(names: string[]) {
  const { service } = fakeTools(names)
  let listener:
    | ((exec: { name: string }, next: () => unknown) => unknown)
    | undefined
  const ctx: GateContext = {
    tools: service,
    on: (_event, l) => {
      listener = l
      return () => undefined
    },
  }
  return {
    ctx,
    call: (tool: string) =>
      listener?.({ name: tool }, () => ({ kind: 'allow' })),
  }
}

describe('apply', () => {
  it('denies a call the manifest does not cover', () => {
    const { ctx, call } = fakeCtx(['read', 'bash'])
    apply(ctx, {
      manifest:
        '---\ncapmark: 0.1\nplugin: reader\n---\n```cap\ngrant fs:read\n```\n',
    })
    expect(call('bash')).toMatchObject({ kind: 'deny' })
    expect(call('read')).toMatchObject({ kind: 'allow' })
  })

  it('fails at mount on a manifest that does not parse, not at the first call', () => {
    const { ctx } = fakeCtx(['read'])
    expect(() => apply(ctx, { manifest: 'not a manifest' })).toThrow(
      /did not parse/,
    )
  })

  it('denies everything when strict and unconfigured, rather than failing open', () => {
    const { ctx, call } = fakeCtx(['read'])
    apply(ctx, {})
    expect(call('read')).toMatchObject({ kind: 'deny' })
  })

  it('allows everything only when strict is explicitly turned off', () => {
    const { ctx, call } = fakeCtx(['read'])
    apply(ctx, { strict: false })
    expect(call('read')).toMatchObject({ kind: 'allow' })
  })
})

describe('discover', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'capmark-gate-'))
  const GOOD = '---\ncapmark: 0.1\nplugin: p\n---\n```cap\ngrant fs:read\n```\n'

  it('finds a CAP.md beside the package manifest', () => {
    const d = dir()
    writeFileSync(join(d, 'CAP.md'), GOOD)
    expect(discover(d)).toMatchObject({ kind: 'found' })
  })

  it('falls back to the Agent Plugins extensions slot', () => {
    const d = dir()
    writeFileSync(
      join(d, 'package.json'),
      JSON.stringify({
        name: 'p',
        extensions: { 'dev.capmark': { manifest: GOOD } },
      }),
    )
    const found = discover(d)
    expect(found.kind).toBe('found')
    expect(found.kind === 'found' && found.source).toContain('dev.capmark')
  })

  it('reports a malformed manifest instead of treating it as absent', () => {
    const d = dir()
    writeFileSync(join(d, 'CAP.md'), '# no frontmatter\n')
    expect(discover(d)).toMatchObject({ kind: 'invalid' })
  })

  it('reports absence when there is nothing to find', () => {
    expect(discover(dir())).toMatchObject({ kind: 'absent' })
  })
})
