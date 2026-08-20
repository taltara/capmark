/**
 * Runs the gate against a real harness.
 *
 * Unit tests drive the gate with a fake registry, which proves the policy and
 * nothing about the seam. This masks a live agent scope and then pushes calls
 * through the harness's own `tools/pre-execute` waterfall, using the same
 * scope-carrier routing `dsh-tools` uses, so the verdicts recorded here are the
 * verdicts a real tool call would get.
 */

import { writeFileSync } from 'node:fs'
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope'
import { parse } from 'capmark'
import { apply as applyGate, gateAgent } from 'dsh-capmark-gate'

export const inject = ['tools', 'agentPresets']
export const name = 'capmark-gate-check'

const MANIFEST = `---
capmark: 0.1
plugin: reader
---
\`\`\`cap
grant fs:read
never proc:spawn
\`\`\`

Reads files. Never runs a shell.
`

const PROBED = ['read', 'grep', 'bash', 'write', 'web_search']

export function apply(ctx, config) {
  const out = config?.out
  if (!out)
    throw new Error('gate-check: `out` (an absolute file path) is required')

  const run = async () => {
    const parsed = parse(MANIFEST)
    if (!parsed.ok) throw new Error('fixture manifest did not parse')

    const key = Symbol('capmark-gate-check')
    const scope = createScope(ctx, key)
    await ctx.agentPresets.mount(scope.ctx, 'standard')

    const before = ctx.tools.schemas(key).map((s) => s.name)
    const report = gateAgent(scope.ctx, parsed.manifest, before)
    const after = ctx.tools.schemas(key).map((s) => s.name)

    applyGate(scope.ctx, { manifest: MANIFEST })

    // The carrier must carry the agent's key: an untagged carrier does not
    // reach a listener owned by a scope, so probing with one would record
    // "allow" for everything and look like the gate had failed open.
    const carrier = scopeTarget(ctx.tools, key)
    const verdicts = {}
    for (const tool of PROBED) {
      verdicts[tool] = await ctx.waterfall(
        carrier,
        'tools/pre-execute',
        { name: tool },
        () => Promise.resolve({ kind: 'allow' }),
      )
    }

    writeFileSync(
      out,
      JSON.stringify(
        {
          beforeCount: before.length,
          afterCount: after.length,
          after,
          masked: report.masked,
          verdicts,
        },
        null,
        2,
      ),
    )
  }

  run().catch((error) => {
    writeFileSync(
      out,
      JSON.stringify({ error: String(error), stack: error?.stack }, null, 2),
    )
  })
}
