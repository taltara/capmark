/**
 * Drafts a manifest from what a plugin already declares.
 *
 * Nothing in the ecosystem ships a `CAP.md` yet, which makes the checker inert:
 * point it at any real plugin today and the answer is "no manifest", every
 * time. Asking every author to write one from a blank file is a bet that has
 * never worked for any format. So this reads the declarations a plugin already
 * makes and proposes a starting point the author can correct.
 *
 * What it reads is static and honest:
 *
 * - `inject` — a plain array at module level, which is how a Cordis plugin
 *   names the services it needs. Reading it requires no execution and no
 *   guessing. `dsh-poison-guard` says `inject = ['tools']`; that is a fact
 *   about the plugin, not an inference about it.
 * - the rows its `cordis.patch.yml` inserts.
 *
 * What it cannot read is behaviour. A plugin that injects `shell` may run one
 * fixed command or accept anything a model hands it, and nothing static tells
 * them apart. **Every result is a draft for a human to correct**, and the
 * emitted file says so in a comment that survives into the committed manifest.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { lookup } from './vocabulary.ts'

/** Why a capability was proposed, so an author can disagree with the reason. */
export interface Reason {
  readonly capability: string
  /** The declaration that suggested it, quoted. */
  readonly evidence: string
}

export interface Inference {
  /** Package name, from package.json. */
  readonly plugin?: string
  /** Services the plugin injects, as written. */
  readonly injects: readonly string[]
  /**
   * How many host files were read.
   *
   * Zero means nothing was inspected — a wrong path, or a package that ships
   * no built output. Without this, "declares nothing" and "I could not read
   * it" produce the same empty draft, and only one of them is safe to commit.
   */
  readonly filesScanned: number
  /** Proposed grants, each with the evidence behind it. */
  readonly proposed: readonly Reason[]
  /**
   * Services that carry real authority but map to no capability capmark can
   * enforce. Reported rather than silently dropped: an author reading a draft
   * needs to know what it did not cover.
   */
  readonly unmapped: readonly string[]
}

/**
 * Injectable rc.7 services that imply a capability.
 *
 * Deliberately partial. A service only appears here when reaching it means the
 * plugin can do the thing the capability names — not merely that it observes
 * something related. `sessions` is absent for that reason: nearly every plugin
 * injects it, and reading a session log is not a capability in this vocabulary.
 */
const SERVICE_CAPABILITY: Readonly<Record<string, string>> = {
  shell: 'proc:spawn',
  subprocess: 'proc:spawn',
  terminals: 'proc:spawn',
  credentials: 'credentials:read',
  fs: 'fs:read',
  web: 'net:fetch',
  jobs: 'jobs:control',
  skills: 'skills:invoke',
  subagents: 'subagent:spawn',
  agents: 'subagent:spawn',
  loader: 'plugins:manage',
  codeRuntime: 'code:run',
  workflowEngine: 'workflow:run',
  userQuestions: 'user:prompt',
  goals: 'goal:manage',
}

/**
 * Services that grant real authority with no capability to express them.
 *
 * Named explicitly rather than left to fall through, because "capmark had no
 * opinion" and "capmark approved" must not look the same in a draft.
 */
const AUTHORITY_NO_CAPABILITY = new Set([
  'sandbox',
  'sandboxPolicy',
  'approval',
  'permissionPresets',
  'settings',
  'llm',
  'storage',
  'spillStore',
  'apiProxy',
  'webServer',
])

const INJECT_ARRAY = /inject\s*[=:]\s*\[([^\]]*)\]/g
const QUOTED = /["']([^"']+)["']/g

/**
 * A literal list of bare service names and nothing else.
 *
 * Needed because plenty of code *handles* inject arrays without declaring one.
 * `dsh-blueprint` contains `row.inject.map((item) => emitScalar(item)).join(", ")`
 * while emitting YAML, and a looser reader pulled `", "` out of it and offered
 * it as a service. A declaration is a flat list of identifiers; anything with a
 * call, a template, or punctuation in it is code that mentions the word.
 */
const LITERAL_LIST = /^\s*(?:["'][@A-Za-z][A-Za-z0-9_@/.-]*["']\s*,?\s*)*$/

/** Every `inject` array in a built plugin, flattened and deduplicated. */
export function readInjects(source: string): string[] {
  const found = new Set<string>()
  for (const match of source.matchAll(INJECT_ARRAY)) {
    const body = match[1] ?? ''
    if (!LITERAL_LIST.test(body)) continue
    for (const name of body.matchAll(QUOTED)) {
      const value = name[1]
      // Bare service names only. A package specifier is a client-bundle
      // dependency, which says nothing about host authority.
      if (
        value !== undefined &&
        value.trim() !== '' &&
        !value.includes('/') &&
        !value.startsWith('@')
      ) {
        found.add(value)
      }
    }
  }
  return [...found].sort()
}

function jsFiles(dir: string, depth = 0): string[] {
  if (depth > 2) return []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) out.push(...jsFiles(full, depth + 1))
    else if (entry.endsWith('.js') && !entry.endsWith('.map.js')) out.push(full)
  }
  return out
}

/**
 * Propose a manifest for an installed plugin.
 *
 * @param packageDir - the plugin's package root.
 */
export function infer(packageDir: string): Inference {
  let plugin: string | undefined
  try {
    plugin = (
      JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
        name?: string
      }
    ).name
  } catch {
    plugin = undefined
  }

  const injects = new Set<string>()
  let filesScanned = 0
  for (const file of jsFiles(packageDir)) {
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    // Skip the browser half. Its `inject` names client-side UI services, which
    // carry no host authority — counting them would propose capabilities for
    // rendering a tab.
    if (source.includes('window.__ModuleLoader__')) continue
    filesScanned += 1
    for (const name of readInjects(source)) injects.add(name)
  }

  const proposed: Reason[] = []
  const seen = new Set<string>()
  const unmapped: string[] = []

  for (const service of [...injects].sort()) {
    const capability = SERVICE_CAPABILITY[service]
    if (capability === undefined) {
      if (AUTHORITY_NO_CAPABILITY.has(service)) unmapped.push(service)
      continue
    }
    if (seen.has(capability)) continue
    seen.add(capability)
    proposed.push({
      capability,
      evidence: `injects \`${service}\``,
    })
  }

  return {
    plugin,
    injects: [...injects].sort(),
    filesScanned,
    proposed,
    unmapped,
  }
}

/** Render an inference as a `CAP.md` the author can edit and commit. */
export function draft(inference: Inference): string {
  const lines = [
    '---',
    'capmark: 0.1',
    `plugin: ${inference.plugin ?? 'REPLACE-ME'}`,
    '---',
    '',
    '# Capabilities',
    '',
    '<!--',
    '  DRAFT, generated by `capmark infer` from the services this plugin',
    '  injects. It describes what the plugin CAN reach, not what it does.',
    '  Review every line before committing: remove what you do not need, and',
    '  add anything a static read cannot see.',
    '-->',
    '',
    '```cap',
  ]

  if (inference.filesScanned === 0) {
    lines.push(
      '# NOTHING WAS READ: no host JavaScript found in this package, so this',
      '# draft is empty because nothing was inspected, not because the plugin',
      '# asks for nothing. Check the path, or build the package first.',
    )
  } else if (inference.proposed.length === 0) {
    lines.push(
      '# nothing to grant: this plugin injects no service that implies one',
    )
  } else {
    const width = Math.max(
      ...inference.proposed.map((p) => p.capability.length),
    )
    for (const p of inference.proposed) {
      lines.push(`grant ${p.capability.padEnd(width)}  # ${p.evidence}`)
    }
  }
  lines.push('```', '')

  if (inference.unmapped.length > 0) {
    lines.push(
      '# Not covered',
      '',
      'This plugin also injects services that carry authority capmark has no',
      'capability for, so nothing above constrains them:',
      '',
      ...inference.unmapped.map((s) => `- \`${s}\``),
      '',
    )
  }

  lines.push(
    '# Rationale',
    '',
    'REPLACE THIS. Say what the plugin does with what it asks for, in a sentence',
    'or two. A reviewer reads this before the grant list.',
    '',
  )
  return lines.join('\n')
}

/** Capability ids a draft proposes that the vocabulary does not know. */
export function unknownProposals(inference: Inference): string[] {
  return inference.proposed.map((p) => p.capability).filter((c) => !lookup(c))
}
