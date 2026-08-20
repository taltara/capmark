I cannot help with the workspace mounting itself — I have not reproduced the
read/write/edit failures you are seeing — but one of the questions left open
here has a definite answer, and it seemed worth writing down separately from the
bug.

**Do `run_code` sub-dispatches skip the policy layer?** No. A sub-call made from
inside a Code Mode program goes through `scheduler.prepare`, which routes to
`prepareScheduledExecution`, which runs the same `tools/pre-execute` waterfall a
model-direct call runs. Deny and ask decisions apply to it exactly as they would
outside Code Mode.

Two related details from the same reading, since they surprised me:

The `run_code` transport itself cannot be restricted away. `tools.restrict()`
refuses the name outright:

```
tools.restrict() cannot name reserved Code Mode presentation transport
"run_code"; restrict end-capability tools instead
```

and the registry re-adds it to every non-native view after restrictions are
applied — I checked on a live agent, where restricting to `allow: [read]` left a
visible set of `[read, run_code]`.

Those two facts fit together in a way that is reassuring rather than worrying:
the transport is always present, and everything it dispatches is still policed.
The error message is telling you to restrict end capabilities precisely because
restricting the transport would be the wrong lever.

That does mean the sandbox is the layer that has to answer your actual report.
If `bash` and `glob` see the workspace while `read` and `edit` do not, the
divergence is below the policy waterfall, since all four cross the same
pre-execute path — which narrows it to the executors or the worker-thread mount,
matching your own theory.

Verified against `0.1.0-rc.7`; you mention rc.6, so it is worth confirming on
your line before relying on it.
