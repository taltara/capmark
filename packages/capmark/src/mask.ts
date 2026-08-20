/**
 * Turns a manifest into the tool mask a harness can actually apply.
 *
 * A capability manifest is usually pitched as a safety feature, but the same
 * declaration answers a cheaper question: which tools does this agent have no
 * business seeing? Tool schemas are re-sent on every request, so a tool that is
 * never callable is paid for on every turn of every session.
 *
 * `tools.restrict()` in rc.7 takes exactly this shape and intersects with any
 * other restriction in force, so a mask can only ever narrow the surface.
 */

import type { Manifest } from './parse.ts'
import { lookup, unclaimedTools } from './vocabulary.ts'

/**
 * Tools a mask cannot remove.
 *
 * `run_code` is the Code Mode presentation transport. The registry re-adds it
 * to every non-native view after restrictions are applied, and `restrict()`
 * throws outright if you so much as name it. Modelling it as maskable
 * overstated the saving on the `code` preset by 3.5 points, which is exactly
 * the kind of error a paper calculation makes and a live harness does not.
 *
 * It is not a hole: a Code Mode sub-dispatch still passes `tools/pre-execute`,
 * so end capabilities stay enforced even though the transport is always there.
 */
export const UNMASKABLE: ReadonlySet<string> = new Set(['run_code'])

/**
 * The `ToolRestriction` shape `tools.restrict()` accepts.
 *
 * Never contains an {@link UNMASKABLE} name — passing one throws rather than
 * being ignored, so filtering here is what keeps the call from failing.
 */
export interface ToolMask {
  readonly allow: readonly string[]
}

export interface MaskPlan {
  readonly mask: ToolMask
  /** Tools the manifest justifies, in registry order. */
  readonly kept: readonly string[]
  /** Tools dropped because no grant covers them. */
  readonly dropped: readonly string[]
  /**
   * Registered tools no capability in the vocabulary claims. These are kept —
   * a mask must never remove a tool on the grounds that capmark has not
   * learned about it yet — and reported so the gap is visible instead of
   * silently costing coverage.
   */
  readonly unclaimed: readonly string[]
  /**
   * True when the mask would leave the agent nothing to call.
   *
   * This is a mismatch between manifest and preset, not a saving. It scores as
   * a near-total reduction on any byte measure, so it has to be named
   * explicitly or a benchmark will happily report a broken agent as its best
   * result.
   */
  readonly empty: boolean
}

/** Tool names a manifest permits: granted, minus anything a `never` forbids. */
export function allowedTools(manifest: Manifest): Set<string> {
  const allowed = new Set<string>()
  for (const grant of manifest.grants) {
    for (const tool of lookup(grant.capability)?.tools ?? []) allowed.add(tool)
  }
  for (const never of manifest.nevers) {
    for (const tool of lookup(never.capability)?.tools ?? [])
      allowed.delete(tool)
  }
  return allowed
}

/**
 * Plan a mask against the tools a profile actually registered.
 * @param registered - tool names from `ctx.tools.schemas(scope)`.
 */
export function planMask(
  manifest: Manifest,
  registered: readonly string[],
): MaskPlan {
  const allowed = allowedTools(manifest)
  const unclaimed = unclaimedTools(registered)
  const unclaimedSet = new Set(unclaimed)

  const kept: string[] = []
  const dropped: string[] = []
  for (const tool of registered) {
    // An unmaskable tool stays visible whatever the manifest says, so it is
    // kept — reporting it as dropped would promise a removal that never happens.
    if (allowed.has(tool) || unclaimedSet.has(tool) || UNMASKABLE.has(tool)) {
      kept.push(tool)
    } else dropped.push(tool)
  }

  const maskable = kept.filter((t) => !UNMASKABLE.has(t))

  return {
    mask: { allow: maskable },
    kept,
    dropped,
    unclaimed,
    empty: registered.length > 0 && maskable.length === 0,
  }
}

export interface SchemaLike {
  readonly name: string
}

export interface MaskSaving {
  readonly beforeBytes: number
  readonly afterBytes: number
  readonly savedBytes: number
  /** Share of the schema payload removed, 0–1. */
  readonly savedFraction: number
  readonly beforeCount: number
  readonly afterCount: number
}

/**
 * Measure what a mask removes from a real schema payload.
 *
 * Bytes of the serialized schema array, not an estimate: the request carries
 * this array, and any token figure derived from it depends on a tokenizer we
 * do not control. Callers that want tokens should say which tokenizer they
 * used.
 */
export function measureMask<T extends SchemaLike>(
  schemas: readonly T[],
  plan: MaskPlan,
): MaskSaving {
  const keep = new Set(plan.kept)
  const after = schemas.filter((s) => keep.has(s.name))
  const beforeBytes = Buffer.byteLength(JSON.stringify(schemas))
  const afterBytes = Buffer.byteLength(JSON.stringify(after))
  return {
    beforeBytes,
    afterBytes,
    savedBytes: beforeBytes - afterBytes,
    savedFraction:
      beforeBytes === 0 ? 0 : (beforeBytes - afterBytes) / beforeBytes,
    beforeCount: schemas.length,
    afterCount: after.length,
  }
}
