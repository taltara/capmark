/**
 * The decisions the gate makes, with no harness in them.
 *
 * Keeping the policy pure is what lets it be tested without booting anything,
 * and it keeps the plugin half small enough to read in one sitting.
 */

import { allowedTools, capabilityForTool, lookup, type Manifest } from 'capmark'

/** What a pending call is judged against. */
export interface Call {
  readonly tool: string
}

export type Decision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'ask'; readonly reason: string }

export interface PolicyOptions {
  /**
   * Tools no capability in the vocabulary claims.
   *
   * Allowed, deliberately. capmark not having learned a tool is a gap in
   * capmark, and denying on that basis would break working agents to enforce a
   * rule nobody wrote. The gate reports them instead.
   *
   * Only consulted for tools the vocabulary genuinely does not claim. This set
   * comes from a caller, and honouring it blindly would turn one wrong entry
   * into a way past every grant in the manifest — name `bash` here and the
   * shell is open. The check below re-derives the answer instead of trusting
   * it.
   */
  readonly unclaimed: ReadonlySet<string>
}

/**
 * Compile a manifest into a decision function.
 *
 * `never` wins over `grant`, and `require approval` turns an allow into an ask
 * routed to the harness's own approval seam — the gate never renders its own
 * prompt, because two prompts mean two audit trails and a user who learns to
 * click through both.
 */
export function policyFor(manifest: Manifest, options: PolicyOptions) {
  const allowed = allowedTools(manifest)

  const forbidden = new Map<string, string>()
  for (const never of manifest.nevers) {
    for (const tool of lookup(never.capability)?.tools ?? []) {
      forbidden.set(tool, never.capability)
    }
  }

  const asks = new Map<string, string>()
  for (const approval of manifest.approvals) {
    for (const tool of lookup(approval.capability)?.tools ?? []) {
      asks.set(tool, approval.capability)
    }
  }

  return function decide(call: Call): Decision {
    const denied = forbidden.get(call.tool)
    if (denied !== undefined) {
      return {
        kind: 'deny',
        reason: `${manifest.plugin} declares \`never ${denied}\`, and \`${call.tool}\` is part of it`,
      }
    }

    if (allowed.has(call.tool)) {
      const ask = asks.get(call.tool)
      if (ask !== undefined) {
        return {
          kind: 'ask',
          reason: `${manifest.plugin} requires approval for \`${ask}\``,
        }
      }
      return { kind: 'allow' }
    }

    // Deliberately not `unclaimed.has(...)` alone: a claimed tool is decided by
    // the manifest whatever the caller believes about it.
    if (
      options.unclaimed.has(call.tool) &&
      capabilityForTool(call.tool) === undefined
    ) {
      return { kind: 'allow' }
    }

    return {
      kind: 'deny',
      reason: `${manifest.plugin} declares no capability covering \`${call.tool}\``,
    }
  }
}
