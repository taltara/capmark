# capmark

Capability manifests for AI agent plugins. A plugin declares what it may do, in
Markdown, and a checker holds it to that.

Installing a plugin runs someone else's code with your permissions — it can read
your files, spend your credentials, and reach the network. Today the only thing
between you and that is a README and your own reading of it. Scanners look for
known-bad code after the fact. capmark is the other half: the plugin says what
it needs up front, in a form a machine can check.

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

## Use

```sh
npx capmark lint ./CAP.md
```

Exit 0 clean, 1 findings, 2 could not run. `--json` for CI.

```
CAP.md:6  warning unexplained-high-risk-grant  `proc:spawn` hands over broad control; write a sentence saying why
CAP.md:7  warning advisory-scope               scope on `net:fetch` is recorded and audited, but nothing enforces it
CAP.md:8  error   grant-never-conflict         `proc:spawn` is granted on line 6 and forbidden here
```

## The rule that keeps this honest

Every capability in the vocabulary must name a mechanism that actually stops it.

[DSH discussion #174](https://github.com/deepseek-ai/deepseek-harness/discussions/174)
recorded a deny rule on `rm -rf` being walked around with `rm` followed by
`rmdir` in the same run. **Patterns deny spellings. Capabilities deny outcomes.**

Denying a whole tool is not pattern matching — there is no rephrasing your way
to `bash` once `bash` is off the table. So the unit here is a set of tool names.
Anything finer, such as a host allowlist, is advisory, and capmark says so out
loud rather than letting it pass for a wall. A permission system that quietly
overstates itself is worse than none, because people stop reading the code.

## Also: a smaller request

Tool schemas are re-sent on every request, so a tool an agent may never call is
paid for on every turn. A manifest already says which those are.

Measured on a booted `@deepseek-ai/dsh` `0.1.0-rc.7` profile, the default
`standard` preset carries 25 tools in 25,567 bytes; a manifest granting
`fs:read` and `net:fetch` justifies 5 of them, at 2,724 bytes — an 89.3% cut to
the tool payload. That is the tool payload and not the whole request, and it
applies to an agent genuinely scoped to what it declared.

Full numbers and how to reproduce them:
<https://github.com/taltara/capmark/tree/main/packages/capmark/bench>

## Status

Early, and the format version says so. Vocabulary is fourteen capabilities, each
bound to tool names captured from a running harness rather than read from docs.

## License

MIT
