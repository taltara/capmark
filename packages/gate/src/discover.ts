/**
 * Finds the manifest for an installed plugin.
 *
 * Two places, in order: a `CAP.md` beside the package manifest, and an
 * `extensions["dev.capmark"]` block inside `package.json`. The second exists
 * because the Agent Plugins 1.0.0 schema is closed — client data MUST live
 * under a reverse-domain key in `extensions` — so that is where a manifest has
 * to go for a plugin that ships to that spec rather than to npm alone.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Manifest, type ParseError, parse } from 'capmark'

export type Discovery =
  | {
      readonly kind: 'found'
      readonly manifest: Manifest
      readonly source: string
    }
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'invalid'
      readonly source: string
      readonly errors: readonly ParseError[]
    }

function read(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * @param packageDir - the plugin's package root.
 */
export function discover(packageDir: string): Discovery {
  const capPath = join(packageDir, 'CAP.md')
  const inline = read(capPath)
  if (inline !== undefined) {
    const result = parse(inline)
    return result.ok
      ? { kind: 'found', manifest: result.manifest, source: capPath }
      : { kind: 'invalid', source: capPath, errors: result.errors }
  }

  const pkgPath = join(packageDir, 'package.json')
  const raw = read(pkgPath)
  if (raw === undefined) return { kind: 'absent' }

  let pkg: { extensions?: Record<string, unknown> }
  try {
    pkg = JSON.parse(raw) as typeof pkg
  } catch {
    return { kind: 'absent' }
  }

  const embedded = pkg.extensions?.['dev.capmark']
  if (typeof embedded !== 'string') return { kind: 'absent' }

  const result = parse(embedded)
  return result.ok
    ? {
        kind: 'found',
        manifest: result.manifest,
        source: `${pkgPath}#extensions[dev.capmark]`,
      }
    : { kind: 'invalid', source: pkgPath, errors: result.errors }
}
