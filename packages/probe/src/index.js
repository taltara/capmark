/**
 * Measures what a tool mask actually removes, on a running harness.
 *
 * Reading the source suggests preset tools are maskable: an agent's own-layer
 * registrations bypass the admit check, but a preset's tools live in the
 * standing composition, which is a PARENT of the agent scope, so they arrive
 * inherited. Suggests is not the same as does, and the whole efficiency claim
 * rests on the answer — so this calls `tools.restrict()` for real and re-reads
 * the schemas afterwards.
 */

import { writeFileSync } from 'node:fs'
import { createScope } from '@deepseek-ai/dsh-scope'

export const inject = ['tools', 'agentPresets']

export const name = 'capmark-probe'

/** What a read-only plugin would justify: fs:read plus net:fetch. */
const KEEP = new Set([
  'read',
  'read_image',
  'glob',
  'grep',
  'web_fetch',
  'web_search',
])

export function apply(ctx, config) {
  const out = config?.out
  if (!out)
    throw new Error('capmark-probe: `out` (an absolute file path) is required')

  const run = async () => {
    const presets = await ctx.agentPresets.list()
    const measured = []

    for (const preset of presets) {
      const key = Symbol(`capmark-probe:${preset.id}`)
      const scope = createScope(ctx, key)
      const entry = { preset: preset.id }
      try {
        await ctx.agentPresets.mount(scope.ctx, preset.id)
        const before = ctx.tools.schemas(key)
        entry.before = { count: before.length, schemas: before }

        const allow = before.map((s) => s.name).filter((n) => KEEP.has(n))
        try {
          scope.ctx.tools.restrict({ allow })
          const after = ctx.tools.schemas(key)
          entry.after = { count: after.length, names: after.map((s) => s.name) }
          entry.afterBytes = Buffer.byteLength(JSON.stringify(after))
        } catch (error) {
          // A refused restriction is the finding, not an error to swallow.
          entry.restrictError = String(error)
        }
      } catch (error) {
        entry.error = String(error)
      }
      measured.push(entry)
    }

    writeFileSync(
      out,
      JSON.stringify(
        { defaultPreset: ctx.agentPresets.defaultId, presets: measured },
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
