# dsh-capmark-gate

Hold a DeepSeek Harness agent to a [capmark](https://www.npmjs.com/package/capmark)
capability manifest: mask the tools it can see, and judge every call it makes.

## What it does

Two seams, both verified against `@deepseek-ai/dsh` `0.1.0-rc.7` and `0.1.1-rc.2`:

- **`tools.restrict()`** narrows what the agent can see. This is where the
  payload saving comes from — a tool absent from the view is absent from the
  request.
- **`tools/pre-execute`** judges every call. A returned decision short-circuits
  the waterfall; `next()` delegates, so an allow here can never force-allow a
  call another policy would deny.

The two overlap deliberately. A mask alone is not enough: a tool registered
into the agent's own layer bypasses the admit check, and `run_code` is re-added
to every non-native view *after* restrictions apply. Both stay callable, so both
are judged at pre-execute.

## What it does not do

**It does not sandbox a plugin's own code.** A DSH plugin's `apply()` runs
in-process with full Node privileges before any tool call happens. A capability
manifest governs what an *agent* may call. Refusing to install an over-reaching
plugin is a separate and earlier decision, made where the overlay row is
written.

Saying this plainly matters more than the feature list. A permission system that
implies a boundary it does not hold is worse than none, because people stop
reading the code.

## Measured on a live harness

The gate masked a `standard` agent with a manifest granting `fs:read` and
forbidding `proc:spawn`, then drove real calls through the harness's own
waterfall:

```
tools visible: 25 -> 4        (read, glob, grep, read_image)
masked (21):   bash, write, edit, job_*, skill, web_search, subagent, ...

read         allow
grep         allow
bash         deny  - reader declares `never proc:spawn`, and `bash` is part of it
write        deny  - reader declares no capability covering `write`
web_search   deny  - reader declares no capability covering `web_search`
```

That capture is committed as a fixture, and a test asserts the policy still
produces those verdicts.

## Configure

Ships disabled. A gate with no manifest denies every call in strict mode, so
installing it must not silently mute an agent.

```yaml
- id: capmark-gate
  disabled: false
  config:
    manifest: |
      ---
      capmark: 0.1
      plugin: reader
      ---
      ```cap
      grant fs:read
      never proc:spawn
      ```
```

`strict` defaults to true: with no manifest, deny. Set it to `false` only on
purpose — a gate that fails open is decoration.

## License

MIT
