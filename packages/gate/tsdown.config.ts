import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/bundle.ts'],
  format: 'esm',
  dts: true,
  outDir: 'lib',
  clean: true,
  external: ['capmark'],
})
