/**
 * Empirically checks the claims we are about to state in public.
 *
 * Each entry records what was tried and what the harness did, so a claim that
 * turns out to be wrong shows up here rather than in a comment thread.
 */

import { writeFileSync } from 'node:fs'
import { createScope } from '@deepseek-ai/dsh-scope'

export const inject = ['tools', 'agentPresets']
export const name = 'capmark-claims'

export function apply(ctx, config) {
  const out = config?.out
  if (!out) throw new Error('claims: `out` is required')

  const run = async () => {
    const results = {}

    // Claim: an unscoped schemas() read returns the global view, which is empty.
    results.globalViewIsEmpty = { count: ctx.tools.schemas().length }

    const key = Symbol('capmark-claims')
    const scope = createScope(ctx, key)
    await ctx.agentPresets.mount(scope.ctx, 'code')
    const names = ctx.tools.schemas(key).map((s) => s.name)
    results.scopedViewHasTools = { count: names.length }

    // Claim: restrict() refuses to name run_code at all.
    try {
      scope.ctx.tools.restrict({ allow: ['read', 'run_code'] })
      results.restrictNamingRunCode = { threw: false }
    } catch (error) {
      results.restrictNamingRunCode = { threw: true, message: String(error) }
    }

    // Claim: run_code survives a restriction that omits it.
    try {
      scope.ctx.tools.restrict({ allow: ['read'] })
      const after = ctx.tools.schemas(key).map((s) => s.name)
      results.runCodeSurvivesMask = {
        after,
        stillPresent: after.includes('run_code'),
      }
    } catch (error) {
      results.runCodeSurvivesMask = { error: String(error) }
    }

    // Claim: restrictions intersect, so a second one can only narrow further.
    try {
      const key2 = Symbol('capmark-claims-2')
      const scope2 = createScope(ctx, key2)
      await ctx.agentPresets.mount(scope2.ctx, 'standard')
      scope2.ctx.tools.restrict({ allow: ['read', 'grep'] })
      const first = ctx.tools.schemas(key2).map((s) => s.name)
      // A second, WIDER restriction must not re-admit anything.
      scope2.ctx.tools.restrict({ allow: ['read', 'grep', 'bash', 'write'] })
      const second = ctx.tools.schemas(key2).map((s) => s.name)
      results.restrictionsIntersect = {
        afterNarrow: first,
        afterAttemptedWiden: second,
        widened: second.length > first.length,
      }
    } catch (error) {
      results.restrictionsIntersect = { error: String(error) }
    }

    writeFileSync(out, JSON.stringify(results, null, 2))
  }

  run().catch((error) => {
    writeFileSync(
      out,
      JSON.stringify({ error: String(error), stack: error?.stack }, null, 2),
    )
  })
}
