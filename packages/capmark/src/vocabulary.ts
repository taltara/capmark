/**
 * The capmark v0.1 capability vocabulary.
 *
 * The one rule that keeps this list short: every capability MUST name an
 * enforcing mechanism. A capability that can only be checked by matching the
 * text of a tool argument is not enforcement — DSH discussion #174 showed a
 * deny rule on `rm -rf` being walked around with `rm` plus `rmdir` in the same
 * run. Patterns deny spellings; capabilities deny outcomes.
 *
 * Denying a whole tool is not argument matching. There is no way to rephrase
 * your way to `bash` once `bash` is off the table, which is why the unit here
 * is a set of tool names rather than a set of argument shapes. Anything finer
 * than that — a host allowlist, a path prefix — is advisory, and lands in
 * `audit` where it cannot be mistaken for a boundary.
 *
 * Tool names were read off an installed `@deepseek-ai/dsh` 0.1.0-rc.7 profile,
 * not from the docs.
 */

/** How a capability is actually denied, once declared and then exceeded. */
export type Enforcement =
  /** Deny at the `tools/pre-execute` waterfall, keyed by tool name. */
  | 'pre-execute'
  /** Refuse to write the overlay row at all, before the plugin can load. */
  | 'write-time'

export interface Capability {
  /** `namespace:verb`, the token written after `grant` or `never`. */
  readonly id: string
  /** One line, shown in lint output and compiled into generated docs. */
  readonly summary: string
  readonly enforcement: Enforcement
  /**
   * The rc.7 tool names this capability covers. Empty for structural
   * capabilities, which have no tool of their own and are caught at write time.
   */
  readonly tools: readonly string[]
  /**
   * Scope values this capability accepts. An empty list means the capability
   * takes no scope; a non-empty one is closed, so a typo is a lint error rather
   * than a silently ignored restriction.
   */
  readonly scopes: readonly string[]
  /**
   * True when `scope` narrows the grant advisorily rather than mechanically —
   * the value is recorded and audited, but nothing enforces it. Callers must
   * never present these as a boundary.
   */
  readonly scopeIsAdvisory: boolean
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'fs:read',
    summary: 'Read files and search the filesystem.',
    enforcement: 'pre-execute',
    tools: ['read', 'read_image', 'glob', 'grep'],
    scopes: ['workspace', 'home', 'any'],
    scopeIsAdvisory: false,
  },
  {
    id: 'fs:write',
    summary: 'Create, edit, or overwrite files.',
    enforcement: 'pre-execute',
    tools: ['write', 'edit', 'str_replace_editor'],
    scopes: ['workspace', 'home', 'any'],
    scopeIsAdvisory: false,
  },
  {
    id: 'proc:spawn',
    summary: 'Run shell commands.',
    enforcement: 'pre-execute',
    tools: ['bash', 'pwsh'],
    scopes: [],
    scopeIsAdvisory: false,
  },
  {
    id: 'net:fetch',
    summary: 'Reach the network.',
    enforcement: 'pre-execute',
    tools: ['web_fetch', 'web_search'],
    // A host list is a wish, not a wall: nothing in rc.7 checks the URL before
    // the tool body runs. Recorded and audited, never enforced.
    scopes: [],
    scopeIsAdvisory: true,
  },
  {
    id: 'subagent:spawn',
    summary: 'Start and steer subagents.',
    enforcement: 'pre-execute',
    tools: [
      'subagent',
      'subagent_fork',
      'list_agents',
      'send_message',
      'interrupt_agent',
      'report',
    ],
    scopes: [],
    scopeIsAdvisory: false,
  },
  {
    id: 'jobs:control',
    summary: 'List, read, and kill background jobs.',
    enforcement: 'pre-execute',
    tools: ['job_list', 'job_output', 'job_kill'],
    scopes: [],
    scopeIsAdvisory: false,
  },
  {
    id: 'plugins:manage',
    summary: 'Mount, unmount, start, or stop plugins at runtime.',
    enforcement: 'pre-execute',
    tools: ['cordis_define', 'cordis_undefine', 'cordis_run', 'cordis_stop'],
    scopes: [],
    scopeIsAdvisory: false,
  },
  {
    id: 'plugins:inspect',
    summary: 'Read the running plugin tree.',
    enforcement: 'pre-execute',
    tools: [
      'cordis_inspect_list',
      'cordis_inspect_query',
      'cordis_inspect_self',
    ],
    scopes: [],
    scopeIsAdvisory: false,
  },
  {
    id: 'skills:invoke',
    summary: 'Load and run skills.',
    enforcement: 'pre-execute',
    tools: ['skill'],
    scopes: [],
    scopeIsAdvisory: false,
  },
  {
    id: 'user:prompt',
    summary: 'Interrupt the user with a question.',
    enforcement: 'pre-execute',
    tools: ['ask_user_question'],
    scopes: [],
    scopeIsAdvisory: false,
  },
  {
    id: 'goal:manage',
    summary: 'Write goals and todo lists.',
    enforcement: 'pre-execute',
    tools: [
      'create_goal',
      'get_goal',
      'update_goal',
      'todo_write',
      'exit_plan_mode',
    ],
    scopes: [],
    scopeIsAdvisory: false,
  },
  {
    id: 'code:run',
    summary: 'Execute a program in-process that can dispatch other tools.',
    // Code Mode is not a hole in the gate: a sub-dispatch goes through
    // `scheduler.prepare` -> `prepareScheduledExecution` -> the
    // `tools/pre-execute` waterfall, exactly like a model-direct call. Verified
    // by reading rc.7, because the opposite would have made every other
    // capability here decorative.
    enforcement: 'pre-execute',
    tools: ['run_code'],
    scopes: [],
    scopeIsAdvisory: false,
  },
  {
    id: 'workflow:run',
    summary: 'Drive multi-step workflow and repeat loops.',
    enforcement: 'pre-execute',
    tools: ['workflow', 'ralph'],
    scopes: [],
    scopeIsAdvisory: false,
  },
  {
    id: 'credentials:read',
    summary: 'Reach the credential store.',
    // No tool of its own — a plugin gets here by injecting the service, so the
    // only moment to catch it is before its row is ever written.
    enforcement: 'write-time',
    tools: [],
    scopes: [],
    scopeIsAdvisory: false,
  },
]

const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]))

export function lookup(id: string): Capability | undefined {
  return BY_ID.get(id)
}

/** Every capability id, sorted — the closed set a manifest may name. */
export function capabilityIds(): string[] {
  return CAPABILITIES.map((c) => c.id).sort()
}

/**
 * Which capability owns a tool. Built once; the gate needs this on every
 * `tools/pre-execute` call, so it must not be a scan.
 */
const BY_TOOL = new Map<string, Capability>()
for (const capability of CAPABILITIES) {
  for (const tool of capability.tools) BY_TOOL.set(tool, capability)
}

export function capabilityForTool(tool: string): Capability | undefined {
  return BY_TOOL.get(tool)
}

/**
 * Tool names no capability claims. A gate cannot decide these from a manifest,
 * so it must say so out loud rather than defaulting either way.
 */
export function unclaimedTools(registered: readonly string[]): string[] {
  return registered.filter((t) => !BY_TOOL.has(t)).sort()
}
