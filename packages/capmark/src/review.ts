/**
 * The decision made before a plugin is installed, not after it is running.
 *
 * A gate governs what an agent may call. It cannot govern a plugin's own code:
 * `apply()` runs in-process with full privileges before any tool call exists.
 * The only moment that decision is available is the one where you choose to add
 * the plugin at all — so this answers "what is this thing asking for?" while
 * refusing is still cheap.
 *
 * It reports rather than decides. Whether an unmanifested plugin is acceptable
 * depends on the deployment, and a library that guessed would be wrong half the
 * time in whichever direction it guessed.
 */

import type { Discovery } from './discover.ts'
import { type Finding, lint } from './lint.ts'
import type { Manifest } from './parse.ts'
import { lookup } from './vocabulary.ts'

/**
 * Capabilities that hand over enough control that the rest of the manifest
 * stops mattering much. A reviewer should read these before anything else.
 */
export const HIGH_RISK: ReadonlySet<string> = new Set([
  'proc:spawn',
  'code:run',
  'plugins:manage',
  'credentials:read',
])

export interface Review {
  /** Package name as declared, when a manifest was found. */
  readonly plugin?: string
  /** Present only when a manifest was found and parsed. */
  readonly manifest?: Manifest
  /** Where the manifest came from, for a reviewer who wants to read it. */
  readonly source?: string
  /** Capabilities granted, sorted, each with its one-line summary. */
  readonly grants: readonly {
    capability: string
    summary: string
    highRisk: boolean
  }[]
  /** Capabilities explicitly forbidden — a promise worth recording. */
  readonly forbids: readonly string[]
  readonly findings: readonly Finding[]
}

const rule = (
  rule: string,
  message: string,
  severity: Finding['severity'] = 'warning',
): Finding => ({
  rule,
  severity,
  line: 1,
  message,
})

/**
 * Review a plugin before its row is written.
 *
 * @param discovery - the result of looking for a manifest in the package.
 * @param packageName - the package the row would install, so a manifest naming
 *   a different one is caught here rather than at mount.
 */
export function review(discovery: Discovery, packageName?: string): Review {
  if (discovery.kind === 'absent') {
    return {
      grants: [],
      forbids: [],
      findings: [
        rule(
          'no-manifest',
          `${packageName ?? 'this plugin'} declares no capabilities, so there is nothing to hold it to`,
        ),
      ],
    }
  }

  if (discovery.kind === 'invalid') {
    return {
      source: discovery.source,
      grants: [],
      forbids: [],
      findings: [
        // Worse than absent: someone wrote a manifest and it does not mean what
        // they think, which reads as a security claim while making none.
        rule(
          'unreadable-manifest',
          `${discovery.source} does not parse: ${discovery.errors
            .map((e) => `line ${e.line}: ${e.message}`)
            .join('; ')}`,
          'error',
        ),
      ],
    }
  }

  const { manifest } = discovery
  const grants = [...manifest.grants]
    .map((g) => ({
      capability: g.capability,
      summary: lookup(g.capability)?.summary ?? '',
      highRisk: HIGH_RISK.has(g.capability),
    }))
    .sort((a, b) => a.capability.localeCompare(b.capability))

  const findings: Finding[] = [...lint(manifest, packageName)]

  const risky = grants.filter((g) => g.highRisk)
  if (risky.length > 0) {
    findings.push(
      rule(
        'high-risk-grant',
        `grants ${risky.map((g) => `\`${g.capability}\``).join(', ')} — read the manifest's rationale before installing`,
      ),
    )
  }

  return {
    plugin: manifest.plugin,
    manifest,
    source: discovery.source,
    grants,
    forbids: [...manifest.nevers].map((n) => n.capability).sort(),
    findings: findings.sort(
      (a, b) => a.line - b.line || a.rule.localeCompare(b.rule),
    ),
  }
}

/** Whether anything in a review should stop an unattended install. */
export function shouldRefuse(review: Review): boolean {
  return review.findings.some((f) => f.severity === 'error')
}
