**Title:** dsh-capmark-gate: hold an agent to a declared capability manifest

A plugin declares what it may do, in Markdown, and the harness holds it to that.

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
require approval for fs:write
​```
```

The file is Markdown first. A client that has never heard of the format still
renders a legible security README — the worst case for an unsupported manifest
is documentation.

## Why another policy plugin

There are already good ones, and this is not a replacement for them. The
difference is the unit of decision. `dsh-tool-policy` and `dsh-permission-rules`
match tool names and argument shapes, which is the right layer for shaping a
call. Discussion #174 also recorded what that layer cannot do: a deny rule on
`rm -rf` was walked around with `rm` followed by `rmdir` in the same run.

So the rule this format is built on is that **every capability must name a
mechanism that actually stops it**. Denying a whole tool qualifies — there is no
rephrasing your way to `bash` once `bash` is off the table. A host allowlist does
not, because nothing checks the URL before the tool body runs. Rather than let
that pass for a wall, the linter says so:

```
warning  advisory-scope  scope on `net:fetch` is recorded and audited, but
                         nothing enforces it — do not rely on it as a boundary
```

## What it does on a running harness

Two seams. `tools.restrict()` narrows what the agent can see, and
`tools/pre-execute` judges every call. Both are needed: a tool registered into
the agent's own layer bypasses the admit check, and `run_code` is re-added to
every non-native view after restrictions apply, so a mask alone leaves both
callable.

Measured on a booted rc.7 `standard` agent, with a manifest granting `fs:read`
and forbidding `proc:spawn`:

```
tools visible: 25 -> 4        (read, glob, grep, read_image)

read         allow
grep         allow
bash         deny  - reader declares `never proc:spawn`, and `bash` is part of it
write        deny  - reader declares no capability covering `write`
web_search   deny  - reader declares no capability covering `web_search`
```

## The part that surprised me

Tool schemas are re-sent on every request, so a tool an agent can never call is
paid for on every turn. That same `standard` preset carries 25 tools in 25,567
bytes — roughly 6.4k tokens per request. The manifest above justifies 5 of them,
at 2,724 bytes, an 89.3% cut to the tool payload.

I went in thinking this was a safety feature and came out thinking the prompt
reduction may be the easier sell. Both come from the same declaration.

Numbers for the other shipped presets, and the probe that captured them, are in
the repo. The `code` preset saves 86.2% rather than the 89.7% my offline
calculation first claimed — `run_code` is unmaskable, which only turned up when
I masked a live harness instead of trusting the arithmetic.

## Limits, stated up front

**It does not sandbox a plugin's own code.** A plugin's `apply()` runs
in-process with full Node privileges before any tool call happens. This governs
what an *agent* may call. Refusing to install an over-reaching plugin is a
separate and earlier decision.

Verified against `0.1.0-rc.7`. Format version is `0.1` and says so.

- Checker and format: <https://www.npmjs.com/package/capmark> (`npx capmark lint ./CAP.md`)
- Gate: <https://github.com/taltara/capmark/tree/main/packages/gate>

Happy to be told the vocabulary is wrong — it is fourteen capabilities today,
and I would rather cut one than add three.
