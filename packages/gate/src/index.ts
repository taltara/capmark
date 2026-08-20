/**
 * capmark gate — hold an agent to a capability manifest.
 *
 * Two seams, both verified against `@deepseek-ai/dsh` 0.1.0-rc.7:
 *
 * - `tools/pre-execute` judges every call. A listener that returns a decision
 *   short-circuits the waterfall; one that calls `next()` delegates. This needs
 *   no scope, so it works wherever the plugin is mounted.
 * - `tools.restrict()` narrows what an agent can see, which is where the
 *   payload saving comes from — a tool absent from the view is absent from the
 *   request. It requires an agent-scoped context, so it is exposed as
 *   {@link gateAgent} for a caller that holds one, rather than being attempted
 *   from wherever this plugin happens to sit.
 *
 * The two overlap on purpose. A mask alone is not enough: a tool registered
 * into the agent's own layer bypasses the admit check, and `run_code` is
 * re-added to every non-native view after restrictions apply. Both remain
 * callable, and both are judged at pre-execute.
 *
 * What this does NOT do, said plainly because a security tool that overstates
 * itself is worse than none: it does not sandbox a plugin's own code. A DSH
 * plugin's `apply()` runs in-process with full Node privileges before any tool
 * call happens. A capability manifest governs what an AGENT may call. Refusing
 * to install an over-reaching plugin is a separate and earlier decision, made
 * where the overlay row is written.
 */

import { type Manifest, parse, planMask, unclaimedTools } from 'capmark'
import { type Decision, policyFor } from './enforce.ts'

/** The slice of the rc.7 tool service this plugin uses. */
export interface ToolsService {
  schemas(scope?: unknown): { name: string }[]
  restrict(filter: { allow?: string[]; deny?: string[] }): () => void
}

/** The slice of a Cordis context this plugin uses. */
export interface GateContext {
  readonly tools: ToolsService
  on(
    event: 'tools/pre-execute',
    listener: (exec: { name: string }, next: () => unknown) => unknown,
  ): () => void
}

export interface GateConfig {
  /** The manifest text this agent is held to, as it appears in a `CAP.md`. */
  readonly manifest?: string
  /**
   * With no manifest, deny rather than allow. A gate that fails open is
   * decoration, so this defaults to true and has to be turned off on purpose.
   */
  readonly strict?: boolean
}

export const inject = ['tools']

export const name = 'capmark-gate'

export interface GateReport {
  /** Tools removed from the agent's view. */
  readonly masked: readonly string[]
  readonly kept: readonly string[]
  /** Tools kept because no capability claims them; a gap to report, not to deny on. */
  readonly unclaimed: readonly string[]
}

/**
 * Narrow one agent's tool view to what its manifest justifies.
 *
 * `registered` is a parameter rather than something read from `agentCtx`
 * because `schemas()` takes an explicit scope key and defaults to the GLOBAL
 * view — which on this harness is empty, since model-facing tools are composed
 * per agent. An earlier version read it here and silently masked nothing: the
 * report said zero tools removed and looked like a success. The caller holds
 * the scope key, so the caller supplies the list.
 *
 * @param agentCtx - an agent-scoped context; `restrict()` refuses an unscoped
 *   one, because a context-global restriction would mask every agent at once.
 * @param registered - tool names visible to that agent, from `schemas(scope)`.
 * @throws when the manifest would leave the agent nothing to call — that is a
 *   manifest/preset mismatch, and applying it would produce a mute agent and a
 *   report that reads like a success.
 */
export function gateAgent(
  agentCtx: { tools: ToolsService },
  manifest: Manifest,
  registered: readonly string[],
): GateReport {
  if (registered.length === 0) {
    throw new Error(
      'capmark-gate: no tools visible to this agent; pass schemas(scope), not the global view',
    )
  }
  const plan = planMask(manifest, registered)

  if (plan.empty) {
    throw new Error(
      `capmark-gate: \`${manifest.plugin}\` grants nothing this agent registered; refusing to mask every tool`,
    )
  }

  if (plan.dropped.length > 0)
    agentCtx.tools.restrict({ allow: [...plan.mask.allow] })

  return { masked: plan.dropped, kept: plan.kept, unclaimed: plan.unclaimed }
}

/** Deny everything, used when strict mode meets a missing manifest. */
function denyAll(reason: string): (call: { tool: string }) => Decision {
  return () => ({ kind: 'deny', reason })
}

export function apply(ctx: GateContext, config: GateConfig): void {
  let decide: (call: { tool: string }) => Decision

  if (config?.manifest) {
    const result = parse(config.manifest)
    if (!result.ok) {
      // Fail at mount rather than at the first tool call: a manifest that does
      // not parse is a deployment error, and discovering it mid-session means
      // discovering it in front of a user.
      throw new Error(
        `capmark-gate: manifest did not parse: ${result.errors
          .map((e) => `line ${e.line}: ${e.message}`)
          .join('; ')}`,
      )
    }
    // Read the registry once at mount for the unclaimed set. A tool registered
    // later is judged against grants alone, which errs toward denying a tool
    // capmark has not learned rather than toward allowing one it has.
    const unclaimed = new Set(
      unclaimedTools(ctx.tools.schemas().map((s) => s.name)),
    )
    decide = policyFor(result.manifest, { unclaimed })
  } else if (config?.strict === false) {
    decide = () => ({ kind: 'allow' })
  } else {
    decide = denyAll(
      'capmark-gate: no manifest configured and strict mode is on',
    )
  }

  ctx.on('tools/pre-execute', (exec, next) => {
    const decision = decide({ tool: exec.name })
    // Returning a decision short-circuits the waterfall; next() delegates to
    // whatever policy sits behind us, so an allow never force-allows a call
    // another listener would deny.
    return decision.kind === 'allow' ? next() : decision
  })
}
