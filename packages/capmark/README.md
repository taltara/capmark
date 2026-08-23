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

## Start from what the plugin already declares

Nobody writes a manifest from a blank file. `infer` reads the services a plugin
injects — a plain array at module level, no execution involved — and drafts one:

```sh
npx capmark infer ./node_modules/some-plugin > CAP.md
```

```
grant plugins:manage  # injects `loader`
```

Every grant carries the declaration that suggested it, so you can disagree with
the reason rather than just the answer. It is a **draft**: static reading sees
what a plugin *can* reach, never what it does, and the emitted file says so in a
comment that survives into the committed manifest. Services that carry authority
capmark has no capability for are listed under **Not covered** rather than
silently dropped — an empty section and an approving one must not look alike.

## Before you install something

A gate holds an *agent* to a manifest. It cannot hold a *plugin*: `apply()` runs
in-process with full privileges the moment the plugin loads, before any tool
call exists. The last point where that is still a choice is the install.

```sh
npx capmark review ./node_modules/some-plugin
```

```
build-helper
  manifest: ./node_modules/build-helper/CAP.md
  grants:
     fs:read            Read files and search the filesystem.
     fs:write           Create, edit, or overwrite files.
   ! proc:spawn         Run shell commands.
  forbids: credentials:read

  rationale:
    Runs the project's own test command and writes coverage output into the
    workspace. It never touches the credential store.
```

It reports and never refuses. Whether an unmanifested plugin is acceptable is a
deployment decision, and today almost none carry a manifest.

## Say it where other specs expect it

```sh
npx capmark compile ./CAP.md --target dsh
npx capmark compile ./CAP.md --target agent-plugins
npx capmark compile ./CAP.md --target skill
```

Each target is a field some other specification actually defines:

- **dsh** — a Cordis overlay row configuring `dsh-capmark-gate`.
- **agent-plugins** — the `extensions["dev.capmark"]` block. The 1.0.0 schema is
  closed, and extension values MUST be objects, so the manifest is the
  `manifest` member of one rather than a bare string.
- **skill** — `allowed-tools`, a real (experimental) Agent Skills field, plus
  `metadata` keys, the spec's slot for properties it does not define.

There is deliberately **no MCP target**. Capability declarations plainly belong
near tool definitions, but the MCP specification has no field that carries them
today, and emitting one would put a security claim somewhere nothing reads.

The embedded manifest is the original bytes, not a reconstruction — so what
ships in a `plugin.json` is what was reviewed.

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

Measured on a booted `@deepseek-ai/dsh` `0.1.1-rc.2` profile, the default
`standard` preset carries 25 tools in 25,965 bytes; a manifest granting
`fs:read` and `net:fetch` justifies 5 of them, at 3,122 bytes — an 88.0% cut to
the tool payload. On `0.1.0-rc.7` the same manifest cut 25,567 bytes to 2,724,
or 89.3%; the versions differ because five tool packages edited their
descriptions, and a schema is mostly its description. That is the tool payload and not the whole request, and it
applies to an agent genuinely scoped to what it declared.

Full numbers and how to reproduce them:
<https://github.com/taltara/capmark/tree/main/packages/capmark/bench>

## Status

Early, and the format version says so. Vocabulary is fourteen capabilities, each
bound to tool names captured from a running harness rather than read from docs.
Verified against `0.1.0-rc.7` and `0.1.1-rc.2`: the three packages the checks
rely on are byte-identical between them, and the one new tool package in
`0.1.1-rc.2` registers a name the vocabulary already covered.

## License

MIT
