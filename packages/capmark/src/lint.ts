/**
 * Checks a manifest that already parsed.
 *
 * These are the mistakes that produce a file which looks like a security
 * boundary and is not one: a grant contradicted by a `never`, a scope that
 * reads as a wall but is only a note, a manifest that grants the run of the
 * house. Each rule exists because the failure is silent without it.
 */

import type { Manifest } from './parse.ts'
import { lookup } from './vocabulary.ts'

export type Severity = 'error' | 'warning'

export interface Finding {
  readonly rule: string
  readonly severity: Severity
  readonly line: number
  readonly message: string
}

/** Grants that hand over the machine, and so deserve a written reason. */
const HIGH_RISK = new Set(['proc:spawn', 'plugins:manage', 'credentials:read'])

export function lint(manifest: Manifest, packageName?: string): Finding[] {
  const findings: Finding[] = []

  if (packageName !== undefined && manifest.plugin !== packageName) {
    findings.push({
      rule: 'plugin-name-mismatch',
      severity: 'error',
      line: 1,
      message: `manifest declares \`${manifest.plugin}\` but the package is \`${packageName}\``,
    })
  }

  const granted = new Map<string, number>()
  for (const grant of manifest.grants) {
    const first = granted.get(grant.capability)
    if (first !== undefined) {
      findings.push({
        rule: 'duplicate-grant',
        severity: 'error',
        line: grant.line,
        message: `\`${grant.capability}\` is already granted on line ${first}`,
      })
      continue
    }
    granted.set(grant.capability, grant.line)
  }

  for (const never of manifest.nevers) {
    const grantLine = granted.get(never.capability)
    if (grantLine !== undefined) {
      // Refusing to guess which one the author meant: a contradiction is an
      // error precisely because either reading could be the unsafe one.
      findings.push({
        rule: 'grant-never-conflict',
        severity: 'error',
        line: never.line,
        message: `\`${never.capability}\` is granted on line ${grantLine} and forbidden here`,
      })
    }
  }

  for (const approval of manifest.approvals) {
    if (!granted.has(approval.capability)) {
      findings.push({
        rule: 'approval-without-grant',
        severity: 'warning',
        line: approval.line,
        message: `\`${approval.capability}\` is not granted, so this approval never fires`,
      })
    }
  }

  for (const grant of manifest.grants) {
    const capability = lookup(grant.capability)
    if (!capability) continue

    if (grant.scope !== undefined && capability.scopeIsAdvisory) {
      findings.push({
        rule: 'advisory-scope',
        severity: 'warning',
        line: grant.line,
        message: `scope on \`${grant.capability}\` is recorded and audited, but nothing enforces it — do not rely on it as a boundary`,
      })
    }

    if (HIGH_RISK.has(grant.capability) && manifest.prose.trim() === '') {
      findings.push({
        rule: 'unexplained-high-risk-grant',
        severity: 'warning',
        line: grant.line,
        message: `\`${grant.capability}\` hands over broad control; write a sentence in the manifest saying why`,
      })
    }
  }

  if (manifest.grants.length === 0) {
    findings.push({
      rule: 'empty-grant-set',
      severity: 'warning',
      line: 1,
      message:
        'no capabilities granted; every tool call from this plugin will be denied',
    })
  }

  return findings.sort(
    (a, b) => a.line - b.line || a.rule.localeCompare(b.rule),
  )
}

export function hasErrors(findings: readonly Finding[]): boolean {
  return findings.some((f) => f.severity === 'error')
}
