import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { measureMask, planMask } from '../src/mask.ts'
import { parse } from '../src/parse.ts'

const CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures-rc7-presets.json', import.meta.url)),
    'utf8',
  ),
)

/** Exactly the three lines shown in assets/capmark-payload.png. */
const M = (() => {
  const r = parse(
    '---\ncapmark: 0.1\nplugin: p\n---\n```cap\ngrant fs:read\ngrant net:fetch\nnever proc:spawn\n```\n\nx\n',
  )
  if (!r.ok) throw new Error('bad')
  return r.manifest
})()

describe('the numbers printed on the launch image', () => {
  for (const [id, tools, before, after, cut] of [
    ['standard', 25, 25567, 2724, '89.3'],
    ['code', 26, 26510, 3667, '86.2'],
    ['cordis', 32, 33055, 2724, '91.8'],
  ] as const) {
    it(`${id} row is exactly right`, () => {
      const s = CAPTURE.presets.find((p: any) => p.preset === id).schemas
      const m = measureMask(
        s,
        planMask(
          M,
          s.map((x: any) => x.name),
        ),
      )
      expect(m.beforeCount).toBe(tools)
      expect(m.beforeBytes).toBe(before)
      expect(m.afterBytes).toBe(after)
      expect((m.savedFraction * 100).toFixed(1)).toBe(cut)
    })
  }
  it('standard leaves exactly 5 tools, the headline number', () => {
    const s = CAPTURE.presets.find((p: any) => p.preset === 'standard').schemas
    expect(
      planMask(
        M,
        s.map((x: any) => x.name),
      ).kept,
    ).toHaveLength(5)
  })
})
