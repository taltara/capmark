This thread is the one I wish I had found three weeks ago, so rather than add
another opinion I want to contribute measurements — I have been building a
capability-manifest layer against rc.7 and most of what I learned bears
directly on the layering @PerryLink sketched.

**The invariant already holds mechanically.** The stated rule — "the Harness
decision is a restriction signal, never a grant" — is not something an external
enforcer has to impose on rc.7. It is how the tool registry already behaves, and
I checked rather than assumed. `tools.restrict()` intersects: I applied
`allow: [read, grep]` to a live agent, then applied a deliberately *wider*
`allow: [read, grep, bash, write]` to the same scope, and the visible set stayed
`[read, grep]`. Nothing was re-admitted. `tools.guard()` carries the same
property in the other direction — its own docs say any matching guard may deny,
while no guard can force-allow a call another guard denied.

So the authority layer has a native ally here. An external enforcer and the
Harness cannot disagree in the dangerous direction, because the Harness side is
structurally incapable of widening.

**Three things that will bite an implementation.** These cost me real time:

`ctx.tools.schemas()` with no scope returns the *global* view, and on a stock
web profile that view is **empty** — zero tools. Model-facing tools are composed
per agent from a preset, so they live in the agent's scope chain. My first
enforcement pass read the global view, masked nothing, and reported success. If
you are inspecting capabilities, pass the scope key.

`run_code` cannot be masked. `tools.restrict()` throws outright if you name it:

```
tools.restrict() cannot name reserved Code Mode presentation transport
"run_code"; restrict end-capability tools instead
```

and the registry re-adds it to every non-native view *after* restrictions apply.
I confirmed a restriction of `allow: [read]` yields a visible set of
`[read, run_code]`.

That sounds alarming for an authority layer, so I traced it: a Code Mode
sub-dispatch goes through `scheduler.prepare` → `prepareScheduledExecution` →
the same `tools/pre-execute` waterfall as a model-direct call. **End capabilities
stay enforced.** The transport is always visible; what it can reach is not
exempt.

Finally, a tool registered into an agent's *own* layer bypasses the admit check
in `view()`, so it stays visible whatever restrictions are in force. A mask
alone is therefore never complete — pre-execute has to back it.

**A number for the cost side.** Something I have not seen published: tool
schemas are re-sent on every request, so an unusable tool is paid for on every
turn. Measured on a booted rc.7 web profile, the shipped `standard` preset
carries 25 tools in 25,567 bytes, roughly 6.4k tokens per request. A task scoped
to reading files and one network call justifies 5 of them, at 2,724 bytes.

That reframes task-scoped capabilities a little. It is a safety feature, but it
is also the cheapest prompt reduction available in the harness, and the two
motivations point at exactly the same mechanism.

**On your open question about enforcement being unavailable** — the only answer
I can defend is fail-closed, and it has to be the default rather than a setting,
because a permissions layer that fails open is decoration the moment anything
goes wrong.

Working code and the capture scripts, if useful:
<https://github.com/taltara/capmark> — the manifest format and checker, and
`dsh-capmark-gate`, which masks an agent and judges calls at `tools/pre-execute`.
On a live `standard` agent, a manifest granting `fs:read` and forbidding
`proc:spawn` took it from 25 tools to 4, with `bash` denied by the `never` rather
than by absence of a grant.

To be clear about its limits: it governs what an *agent* may call. It does not
sandbox a plugin's own code — `apply()` runs in-process with full Node
privileges before any tool call exists — which is precisely why an authority
layer like Towel is solving a different and harder half of this.
