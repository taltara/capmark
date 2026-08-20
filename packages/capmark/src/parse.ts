/**
 * Reads a `CAP.md` into a manifest.
 *
 * The file is Markdown first. Directives live in fenced ```cap blocks, so a
 * reader that has never heard of capmark still renders a legible security
 * README — the worst case for an unsupported manifest is documentation, which
 * is the whole reason the format is a superset rather than a new file type.
 *
 * Errors carry line numbers into the original file, because the first thing
 * anyone does with a rejected manifest is go look at the line.
 */

import { capabilityIds, lookup } from './vocabulary.ts'

export interface Grant {
  readonly capability: string
  readonly scope?: string
  readonly line: number
}

export interface Never {
  readonly capability: string
  readonly line: number
}

export interface RequireApproval {
  readonly capability: string
  readonly line: number
}

export interface Manifest {
  /** Schema version from frontmatter; only `0.1` is understood today. */
  readonly capmark: string
  /** Package name this manifest describes. Must match the package it ships in. */
  readonly plugin: string
  readonly grants: readonly Grant[]
  readonly nevers: readonly Never[]
  readonly approvals: readonly RequireApproval[]
  /** Prose outside the ```cap fences — read by humans and by the model. */
  readonly prose: string
  /**
   * The manifest exactly as written.
   *
   * Kept because compiling to another format has to restate the manifest, and
   * rebuilding it from the parsed parts loses the author's structure — the
   * headings that introduced each fenced block survive with their contents
   * gone. Embedding the original also means what ships in a `plugin.json` is
   * byte-for-byte what was reviewed.
   */
  readonly source: string
}

export interface ParseError {
  readonly line: number
  readonly message: string
}

export type ParseResult =
  | { readonly ok: true; readonly manifest: Manifest }
  | { readonly ok: false; readonly errors: readonly ParseError[] }

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const CAP_FENCE = /^\s*```cap\s*$/
const FENCE_END = /^\s*```\s*$/

/** `key: value` only — deliberately not YAML, so no dependency and no surprises. */
function parseFrontmatter(
  block: string,
  errors: ParseError[],
): Map<string, string> {
  const fields = new Map<string, string>()
  const lines = block.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? ''
    const text = raw.trim()
    if (text === '' || text.startsWith('#')) continue
    const colon = text.indexOf(':')
    if (colon === -1) {
      // Line 1 is the opening `---`, so frontmatter content starts at line 2.
      errors.push({
        line: i + 2,
        message: `expected \`key: value\`, got ${JSON.stringify(text)}`,
      })
      continue
    }
    const key = text.slice(0, colon).trim()
    const value = text.slice(colon + 1).trim()
    if (fields.has(key)) {
      errors.push({
        line: i + 2,
        message: `duplicate frontmatter key \`${key}\``,
      })
      continue
    }
    fields.set(key, value)
  }
  return fields
}

function checkCapability(
  id: string,
  line: number,
  errors: ParseError[],
): boolean {
  if (lookup(id)) return true
  // Naming a capability that does not exist is the failure mode that quietly
  // grants everything, so it is an error and never a warning.
  const known = capabilityIds().join(', ')
  errors.push({
    line,
    message: `unknown capability \`${id}\`. Known: ${known}`,
  })
  return false
}

function parseDirective(
  text: string,
  line: number,
  out: {
    grants: Grant[]
    nevers: Never[]
    approvals: RequireApproval[]
  },
  errors: ParseError[],
): void {
  const approval = /^require\s+approval\s+for\s+(\S+)$/.exec(text)
  if (approval) {
    const id = approval[1] as string
    if (checkCapability(id, line, errors))
      out.approvals.push({ capability: id, line })
    return
  }

  const never = /^never\s+(\S+)$/.exec(text)
  if (never) {
    const id = never[1] as string
    if (checkCapability(id, line, errors))
      out.nevers.push({ capability: id, line })
    return
  }

  const grant = /^grant\s+(\S+)(?:\s+scope=(.+))?$/.exec(text)
  if (grant) {
    const id = grant[1] as string
    if (!checkCapability(id, line, errors)) return
    const rawScope = grant[2]?.trim()
    if (rawScope === undefined) {
      out.grants.push({ capability: id, line })
      return
    }
    const capability = lookup(id) as NonNullable<ReturnType<typeof lookup>>
    if (capability.scopes.length === 0 && !capability.scopeIsAdvisory) {
      errors.push({ line, message: `\`${id}\` takes no scope` })
      return
    }
    if (capability.scopes.length > 0 && !capability.scopes.includes(rawScope)) {
      const allowed = capability.scopes.join(', ')
      errors.push({
        line,
        message: `unknown scope \`${rawScope}\` for \`${id}\`. Allowed: ${allowed}`,
      })
      return
    }
    out.grants.push({ capability: id, scope: rawScope, line })
    return
  }

  errors.push({
    line,
    message: `expected \`grant\`, \`never\`, or \`require approval for\`, got ${JSON.stringify(text)}`,
  })
}

export function parse(source: string): ParseResult {
  const errors: ParseError[] = []

  const frontmatterMatch = FRONTMATTER.exec(source)
  if (!frontmatterMatch) {
    return {
      ok: false,
      errors: [
        {
          line: 1,
          message: 'missing frontmatter: the file must open with a `---` block',
        },
      ],
    }
  }

  const fields = parseFrontmatter(frontmatterMatch[1] as string, errors)
  const capmark = fields.get('capmark')
  const plugin = fields.get('plugin')
  if (capmark === undefined) {
    errors.push({
      line: 1,
      message: 'frontmatter is missing `capmark:` (the schema version)',
    })
  } else if (capmark !== '0.1') {
    errors.push({
      line: 1,
      message: `unsupported schema version \`${capmark}\`; this build reads 0.1`,
    })
  }
  if (plugin === undefined) {
    errors.push({
      line: 1,
      message: 'frontmatter is missing `plugin:` (the package name)',
    })
  }

  const body = source.slice(frontmatterMatch[0].length)
  const bodyStartLine = source
    .slice(0, frontmatterMatch[0].length)
    .split(/\r?\n/).length
  const lines = body.split(/\r?\n/)

  const out = {
    grants: [] as Grant[],
    nevers: [] as Never[],
    approvals: [] as RequireApproval[],
  }
  const prose: string[] = []
  let inFence = false
  let fenceOpenedAt = 0

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? ''
    const line = bodyStartLine + i
    if (!inFence) {
      if (CAP_FENCE.test(raw)) {
        inFence = true
        fenceOpenedAt = line
        continue
      }
      prose.push(raw)
      continue
    }
    if (FENCE_END.test(raw)) {
      inFence = false
      continue
    }
    const text = raw.trim()
    // `#` is a comment inside a cap block, matching every config format the
    // reader already knows.
    if (text === '' || text.startsWith('#')) continue
    parseDirective(text, line, out, errors)
  }

  if (inFence) {
    errors.push({ line: fenceOpenedAt, message: 'unterminated ```cap block' })
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    manifest: {
      capmark: capmark as string,
      plugin: plugin as string,
      grants: out.grants,
      nevers: out.nevers,
      approvals: out.approvals,
      prose: prose.join('\n').trim(),
      source,
    },
  }
}
