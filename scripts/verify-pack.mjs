/**
 * Checks that what we publish actually works.
 *
 * `capmark@0.1.0` shipped with `main: ./src/index.ts` and a tarball containing
 * only `lib/`, so importing the package failed for everyone. The CLI still ran,
 * because `bin` was a literal path, which is why a smoke test of the command
 * passed and told us nothing about the library.
 *
 * The cause: `publishConfig.main/types/exports` rewriting is a pnpm feature.
 * `npm publish` warns and ignores it, and `workspace:*` survives into the
 * published dependencies where nothing can install it.
 *
 * So this packs each workspace package the way a publish would, then reads the
 * manifest and file list out of the tarball itself rather than off disk, and
 * asserts every entry point resolves to a file that is actually inside it.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PACKAGES = ['packages/capmark', 'packages/gate']

let failures = 0

function fail(pkg, message) {
  console.error(`  ✗ ${pkg}: ${message}`)
  failures += 1
}

for (const dir of PACKAGES) {
  const work = mkdtempSync(join(tmpdir(), 'verify-pack-'))
  try {
    // `pnpm pack` applies publishConfig exactly as `pnpm publish` would.
    const out = execFileSync('pnpm', ['pack', '--pack-destination', work], {
      cwd: dir,
      encoding: 'utf8',
    })
    const tarball = out.trim().split('\n').pop()
    const listing = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    const files = new Set(
      listing
        .split('\n')
        .filter(Boolean)
        .map((f) => f.replace(/^package\//, '')),
    )

    execFileSync('tar', ['-xzf', tarball, '-C', work, 'package/package.json'])
    const manifest = JSON.parse(
      readFileSync(join(work, 'package/package.json'), 'utf8'),
    )
    const name = manifest.name

    const norm = (p) => String(p).replace(/^\.\//, '')
    const check = (label, value) => {
      if (value === undefined) return
      const path = norm(value)
      if (!files.has(path))
        fail(name, `${label} -> ${value} is not in the tarball`)
    }

    check('main', manifest.main)
    check('types', manifest.types)
    for (const [key, value] of Object.entries(manifest.exports ?? {})) {
      if (typeof value === 'string') check(`exports["${key}"]`, value)
      else
        for (const [cond, target] of Object.entries(value)) {
          check(`exports["${key}"].${cond}`, target)
        }
    }
    for (const [key, value] of Object.entries(manifest.bin ?? {})) {
      check(`bin["${key}"]`, value)
    }

    // A workspace protocol that survives publication cannot be installed at all.
    for (const field of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
        if (String(range).startsWith('workspace:')) {
          fail(name, `${field}["${dep}"] is still "${range}"`)
        }
      }
    }

    // publishConfig is a build-time instruction; shipping it is noise at best.
    if (manifest.publishConfig?.main !== undefined) {
      fail(name, 'publishConfig.main survived into the published manifest')
    }

    if (!files.has('README.md'))
      fail(name, 'no README.md — that is the npm landing page')
    if (!files.has('LICENSE')) fail(name, 'no LICENSE')

    console.log(`  ${name}: ${files.size} files, entry points resolve`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (failures > 0) {
  console.error(`\n${failures} packaging problem(s). Do not publish.`)
  process.exit(1)
}
console.log('\npackaging ok')
