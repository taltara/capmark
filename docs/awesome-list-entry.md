# awesome-deepseek-harness submission

Target: <https://github.com/0xsline/awesome-deepseek-harness>, **Security &
Governance** section.

**Check the submission mechanism before opening anything** — the repo's
`CONTRIBUTING.md` returns 404, so whether this is a PR or an issue is not yet
established. Match whatever the existing entries did.

## Entry

- [dsh-capmark-gate](https://github.com/taltara/capmark/tree/main/packages/gate) — Hold an agent to a declared capability manifest: masks its tool view with `tools.restrict()` and judges every call at `tools/pre-execute`. Manifests are Markdown ([capmark](https://www.npmjs.com/package/capmark)), so an unsupported one still reads as a security README.

## If a rationale is asked for

The section's existing entries detect or match: `dsh-poison-guard` scans code
before install, `dsh-tool-policy` and `dsh-permission-rules` match tool names and
argument shapes, `dsh-defend` looks for injection and leaks. All of them decide
against a call that has already been written.

This one is the declaration side: the plugin states its capabilities up front,
and the gate refuses anything outside them. It composes with the others rather
than replacing them — the manifest is a natural source for the rules a matcher
enforces.

One measured detail worth including if there is room for it: masking an agent to
its declared capabilities cut the shipped `standard` preset's tool payload from
25,567 to 2,724 bytes, which is re-sent on every request.
