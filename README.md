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

## Check one

```sh
npx capmark lint ./CAP.md
```

Exit 0 clean, 1 findings, 2 could not run. `--json` for CI.

## The saving nobody asks a permission system for

Tool schemas are re-sent on every request, so a tool an agent may never call is
paid for on every turn of every session. A manifest already says which those
are, and `tools.restrict()` in rc.7 takes exactly the mask that falls out of it.

Measured against a booted `@deepseek-ai/dsh` `0.1.0-rc.7` web profile — real
schemas captured from the running registry, not estimates:

| preset | tools | schema bytes | with a `fs:read` + `net:fetch` manifest | cut |
|---|---|---|---|---|
| `standard` (default) | 25 | 25,567 | 5 tools, 2,724 B | **89.3%** |
| `code` | 26 | 26,510 | 5 tools, 2,724 B | 89.7% |
| `cordis` | 32 | 33,055 | 5 tools, 2,724 B | 91.8% |

Read honestly: that is the tool payload, not the whole request, and it applies
to an agent genuinely scoped to what it declared — masking a general-purpose
agent down to one plugin's grants would break it, which is why the report
refuses to score a mask that leaves nothing callable. We make no latency claim,
because we have not measured latency. See [the benchmark](packages/capmark/bench/README.md)
to reproduce it.

## Status

Early. The vocabulary is fourteen capabilities, each bound to tool names captured from
a booted `@deepseek-ai/dsh` `0.1.0-rc.7` profile rather than read from docs —
two of them (`code:run`, `workflow:run`) exist because measuring turned up tools
the docs never mentioned.
Format version `0.1`; expect it to move.

- `packages/capmark` — parser, linter, vocabulary, tool-mask compiler, CLI. Zero dependencies.
- `packages/probe` — measurement instrument; boots against a real profile to capture live tool schemas. Not shipped.

## Develop

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

## License

MIT. See [LICENSE](LICENSE).
