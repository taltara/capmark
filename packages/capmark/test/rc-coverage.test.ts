import { describe, expect, it } from 'vitest'
import { capabilityForTool, unclaimedTools } from '../src/vocabulary.ts'

/**
 * Every model-facing tool the shipped presets register, read from the published
 * `@deepseek-ai/dsh` packages at both versions we claim support for.
 *
 * `0.1.1-rc.2` ships `dsh-tool-pwsh-persistent`, which is new — but it
 * registers the tool name `pwsh`, which `proc:spawn` already covers. That is
 * the outcome a capability vocabulary is supposed to have: a new package
 * arrives and the declaration does not have to change, because the capability
 * was named after the outcome rather than after the package.
 *
 * `dsh-tools`, `dsh-agent-presets` and `dsh-scope` are byte-identical between
 * `0.1.0-rc.7` and `0.1.1-rc.2` (SHA-256 of lib/index.js), so the seams the
 * gate uses are literally the same code at both versions.
 */
const REGISTERED = [
  'ask_user_question',
  'bash',
  'pwsh',
  'glob',
  'grep',
  'read',
  'read_image',
  'write',
  'edit',
  'str_replace_editor',
  'create_goal',
  'get_goal',
  'update_goal',
  'todo_write',
  'exit_plan_mode',
  'job_kill',
  'job_list',
  'job_output',
  'skill',
  'interrupt_agent',
  'send_message',
  'report',
  'subagent',
  'subagent_fork',
  'list_agents',
  'web_fetch',
  'web_search',
  'ralph',
  'workflow',
  'run_code',
  'cordis_define',
  'cordis_undefine',
  'cordis_run',
  'cordis_stop',
  'cordis_inspect_list',
  'cordis_inspect_query',
  'cordis_inspect_self',
]

describe('vocabulary coverage of dsh 0.1.0-rc.7 and 0.1.1-rc.2', () => {
  it('claims every registered tool', () => {
    // An unclaimed tool is allowed at runtime by design, but it is a gap in the
    // vocabulary and should be a decision, not a surprise.
    expect(unclaimedTools(REGISTERED)).toEqual([])
  })

  it('covers the pwsh tool the new persistent package registers', () => {
    expect(capabilityForTool('pwsh')?.id).toBe('proc:spawn')
  })

  it('still routes the dangerous ones where they belong', () => {
    expect(capabilityForTool('cordis_define')?.id).toBe('plugins:manage')
    expect(capabilityForTool('run_code')?.id).toBe('code:run')
    expect(capabilityForTool('bash')?.id).toBe('proc:spawn')
  })
})
