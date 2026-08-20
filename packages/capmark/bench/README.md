# Benchmark

Every number capmark publishes comes from schemas a real harness assembled, not
from an estimate. Reproducing them takes two steps.

**1. Capture.** `packages/probe` is a throwaway plugin that mints a scope per
agent preset, mounts the preset the way a session would, and writes the scoped
`ctx.tools.schemas()` out.

```sh
packages/probe/sync.sh
```

Then write an overlay that inserts the row, and boot a profile with it. Use
`--port 0` so it does not fight a harness you already have running:

```sh
dsh --profile web --patch /absolute/path/to/bench-probe.yml --port 0
```

**2. Report.**

```sh
node --experimental-strip-types packages/capmark/bench/report.ts capture.json examples/CAP.md
```

## What the numbers mean

Tool schemas are re-sent on every request, so a tool an agent may never call is
paid for on every turn of every session. A manifest already says which those
are.

Measured against `@deepseek-ai/dsh` `0.1.0-rc.7`, the shipped `standard` preset
carries 25 tools in 25,567 bytes. A plugin declaring `fs:read` and `net:fetch`
justifies 5 of them, for 2,724 bytes — an 89.3% reduction in the tool payload.

Read that honestly:

- **It is the tool payload, not the whole request.** Conversation history and
  the system prompt are untouched. As a share of a full request the saving
  shrinks, and on a long conversation it shrinks a lot.
- **It applies to a scoped agent.** Masking a general-purpose agent down to one
  plugin's grants would break it, which is why the report refuses to score a
  mask that leaves nothing callable. The case this serves is a subagent or a
  task-scoped agent that genuinely only needs what it declared.
- **Tokens are bytes/4.** The real count comes from the provider's tokenizer.
  Bytes are the honest unit here; tokens are a convenience.
- **The compiler is checked against the harness, not against itself.** The
  probe applies a real `tools.restrict()` and re-reads the registry; a test
  asserts `planMask` reproduces those exact bytes for every preset. That test is
  how we learned `run_code` is unmaskable and that the `code` preset saves
  86.2%, not the 89.7% the offline calculation claimed.
- **No latency claim.** A smaller prompt should reach a first token sooner, but
  we have not measured that, so we do not say it.
