/**
 * One manifest, several places it has to be stated.
 *
 * Each target here corresponds to a field some other specification actually
 * defines. Nothing invents a format: a declaration in a made-up slot is not
 * portable, it is just a longer way of writing a comment, and it would be
 * indistinguishable from one that works until someone depended on it.
 *
 * That is also why there is no MCP target. Capability declarations plainly
 * belong near tool definitions, but the MCP specification has no field that
 * carries them today, and emitting one would put a security claim somewhere
 * nothing reads.
 */

import { allowedTools } from './mask.ts'
import type { Manifest } from './parse.ts'

export type Target = 'dsh' | 'agent-plugins' | 'skill'

export const TARGETS: readonly Target[] = ['dsh', 'agent-plugins', 'skill']

/**
 * The manifest text to embed: the original, not a reconstruction.
 *
 * Rebuilding it from the parsed parts moved every directive into one block and
 * left the headings that had introduced them standing over nothing. What ships
 * is now byte-for-byte what was reviewed.
 */
function manifestSource(manifest: Manifest): string {
  return manifest.source
}

/** Indent a block for a YAML block scalar, leaving blank lines truly blank. */
function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : pad + line))
    .join('\n')
}

/**
 * A Cordis overlay fragment that configures the gate with this manifest.
 *
 * Emitted enabled, unlike the package's shipped patch: someone running this
 * command has chosen the manifest, so a disabled row would be a surprise.
 */
function toDsh(manifest: Manifest): string {
  return [
    `# capmark ${manifest.capmark} manifest for ${manifest.plugin}, compiled for DeepSeek Harness.`,
    '# Applying this row holds the agent to the declaration below.',
    '- insert:',
    '    - id: capmark-gate',
    '      name: dsh-capmark-gate',
    '      config:',
    '        strict: true',
    '        manifest: |',
    indent(manifestSource(manifest), 10),
  ].join('\n')
}

/**
 * The `extensions` block for an Agent Plugins `plugin.json`.
 *
 * The 1.0.0 schema is closed and client data MUST sit under a reverse-domain
 * key whose value is an OBJECT — a bare string is a conformance violation, and
 * since a client MUST ignore namespaces it does not implement without
 * validating them, nothing would ever have told us.
 */
function toAgentPlugins(manifest: Manifest): string {
  return `${JSON.stringify(
    {
      extensions: {
        'dev.capmark': {
          capmark: manifest.capmark,
          manifest: manifestSource(manifest),
        },
      },
    },
    null,
    2,
  )}\n`
}

/**
 * Frontmatter for a `SKILL.md`.
 *
 * `allowed-tools` is a real field in the Agent Skills specification — a
 * space-separated list of pre-approved tools — so the grants compile straight
 * into it. The spec marks it experimental and support varies between clients,
 * which is said in the emitted comment rather than left to be discovered.
 *
 * Everything else goes under `metadata`, the spec's slot for properties it does
 * not define. It is a map of string to string, so the values are strings.
 */
function toSkill(manifest: Manifest): string {
  const tools = [...allowedTools(manifest)].sort()
  const grants = manifest.grants.map((g) => g.capability).sort()
  const nevers = manifest.nevers.map((n) => n.capability).sort()

  const lines = [
    '# Merge into your SKILL.md frontmatter.',
    '# allowed-tools is experimental in the Agent Skills spec and support varies.',
    '# metadata is advisory everywhere: nothing enforces it without a gate.',
  ]
  if (tools.length > 0) lines.push(`allowed-tools: ${tools.join(' ')}`)
  lines.push('metadata:')
  lines.push(`  dev.capmark.version: "${manifest.capmark}"`)
  if (grants.length > 0)
    lines.push(`  dev.capmark.grants: "${grants.join(' ')}"`)
  if (nevers.length > 0)
    lines.push(`  dev.capmark.never: "${nevers.join(' ')}"`)
  return `${lines.join('\n')}\n`
}

export function compile(manifest: Manifest, target: Target): string {
  switch (target) {
    case 'dsh':
      return toDsh(manifest)
    case 'agent-plugins':
      return toAgentPlugins(manifest)
    case 'skill':
      return toSkill(manifest)
  }
}
