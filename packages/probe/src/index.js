/**
 * Dumps the tool schemas a DSH profile actually sends to the model.
 *
 * The naive reading — `ctx.tools.schemas()` at boot — returns nothing, and the
 * empty answer is the interesting part: model-facing tools are not registered
 * globally. They are composed per agent from an agent preset, so the payload a
 * request carries depends on which preset the session runs on. Measuring the
 * global registry would have quietly reported zero and looked like a working
 * benchmark.
 *
 * So this mints a throwaway scope per preset, mounts the preset into it the
 * same way a real session would, and reads the scoped view. Nothing here is a
 * shipped plugin — it is the instrument the benchmark numbers come from.
 */

import { writeFileSync } from 'node:fs'
import { createScope } from '@deepseek-ai/dsh-scope'

export const inject = ['tools', 'agentPresets']

export const name = 'capmark-probe'

export function apply(ctx, config) {
  const out = config?.out
  if (!out)
    throw new Error('capmark-probe: `out` (an absolute file path) is required')

  const run = async () => {
    const presets = await ctx.agentPresets.list()
    const measured = []

    for (const preset of presets) {
      // A broken preset resolves but will not mount; record why rather than
      // dropping it, so a shrinking preset list can never pass for a clean run.
      const key = Symbol(`capmark-probe:${preset.id}`)
      const scope = createScope(ctx, key)
      try {
        await ctx.agentPresets.mount(scope.ctx, preset.id)
        const schemas = ctx.tools.schemas(key)
        measured.push({
          preset: preset.id,
          count: schemas.length,
          schemas,
        })
      } catch (error) {
        measured.push({ preset: preset.id, error: String(error) })
      }
    }

    writeFileSync(
      out,
      JSON.stringify(
        {
          defaultPreset: ctx.agentPresets.defaultId,
          globalCount: ctx.tools.schemas().length,
          presets: measured,
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
