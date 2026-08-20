# Releasing

**Publish with `pnpm`, not `npm`.**

`npm publish` ignores `publishConfig.main`, `types`, and `exports` — it prints a
warning and ships the manifest as written. It also leaves `workspace:*` in
`dependencies`, where nothing can install it.

`capmark@0.1.0` and `dsh-capmark-gate@0.1.0` went out that way. Both were
unusable as libraries: `main` pointed at `src/*.ts`, which the tarball does not
contain. The CLI still worked, because `bin` was a literal path — which is
exactly why a smoke test of the command passed and caught nothing.

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm verify-pack
```

`verify-pack` packs each package the way a publish would, then reads the
manifest and file list out of the tarball rather than off disk, and fails if any
entry point names a file that is not inside it or if a `workspace:` range
survived. CI runs it on every push.

Then, from each package directory, in dependency order:

```sh
pnpm publish --access public
```

`capmark` first — the gate depends on it, and pnpm pins the dependency to the
version that exists at publish time.

## Deprecating a broken release

```sh
npm deprecate capmark@0.1.0 "Broken packaging: main pointed at src/index.ts, which is not in the tarball. Use 0.1.1."
```
