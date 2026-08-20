# capmark

Capability manifests for AI agent plugins. A plugin declares what it may do, in
Markdown, and a checker holds it to that.

Installing a plugin runs someone else's code with your permissions — it can read
your files, spend your credentials, and reach the network. Today the only thing
standing between you and that is a README and your own reading of it. Scanners
look for known-bad code after the fact. capmark is the other half: the plugin
says what it needs up front, in a form a machine can check.

```markdown
---
capmark: 0.1
plugin: dsh-vision-toolkit
---

# Capabilities

​```cap
grant fs:read scope=workspace
grant net:fetch
​```

# Contracts

​```cap
never proc:spawn
require approval for fs:read
​```
```

It is Markdown first. A reader that has never heard of capmark still renders a
legible security README — the worst case for an unsupported manifest is
documentation.

## The rule that keeps this honest

Every capability in the vocabulary must name a mechanism that actually stops it.

This is not a style preference. [DSH discussion #174](https://github.com/deepseek-ai/deepseek-harness/discussions/174)
recorded a deny rule on `rm -rf` being walked around with `rm` followed by
`rmdir` in the same run. **Patterns deny spellings. Capabilities deny outcomes.**

Denying a whole tool is not pattern matching — there is no way to rephrase your
way to `bash` once `bash` is off the table. So the unit here is a set of tool
names. Anything finer, such as a host allowlist, is advisory, and capmark says
so out loud rather than letting it pass for a wall:

```
warning  advisory-scope  scope on `net:fetch` is recorded and audited, but
                         nothing enforces it — do not rely on it as a boundary
```

A permission system that quietly overstates itself is worse than none, because
people stop reading the code.

## Status

Early. The vocabulary is twelve capabilities, each bound to tool names read off
an installed `@deepseek-ai/dsh` `0.1.0-rc.7` profile rather than from docs.
Format version `0.1`; expect it to move.

- `packages/capmark` — parser, linter, vocabulary. Zero dependencies.

## Develop

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

## License

MIT. See [LICENSE](LICENSE).
