// Re-exported from core: finding a manifest is not DSH-specific, and moving it
// there let the write-time review use it without depending on this plugin.
export type { Discovery } from 'capmark'
export { discover } from 'capmark'
export type { Call, Decision, PolicyOptions } from './enforce.ts'
export { policyFor } from './enforce.ts'
export type {
  GateConfig,
  GateContext,
  GateReport,
  ToolsService,
} from './index.ts'
export { apply, gateAgent, inject, name } from './index.ts'
