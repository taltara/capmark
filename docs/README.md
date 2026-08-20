# Upstream drafts

Paste-ready bodies. **Do not copy from this file** — open the individual file so
that "select all, copy" gives exactly the markdown to paste, with no wrapper
fences or headings from this document leaking in. Leaking is what mangles the
GitHub preview: copying a section out of a document that itself uses code fences
produces unbalanced fences, and GitHub then stops treating the blocks as code.

Post them spaced out. Several comments landing on one repo within minutes reads
as a campaign.

## Suggested order

**1. [discussion-2735-comment.md](discussion-2735-comment.md)** — reply to
[#2735](https://github.com/deepseek-ai/deepseek-harness/discussions/2735), a
zero-reply bug report. Answers one of its listed open questions and asks for
nothing. Smallest, most generous, goes first.

**2. [discussion-2506-comment.md](discussion-2506-comment.md)** — reply to
[#2506](https://github.com/deepseek-ai/deepseek-harness/discussions/2506), the
active "Task-scoped capabilities" thread. The substantive one: confirms the
thread's own invariant is mechanically guaranteed by rc.7, contributes the three
gotchas, and publishes the tool-payload measurement. Post a day after the first.

**3. [show-your-plugins-post.md](show-your-plugins-post.md)** — a new post in the
**Show Your Plugins!** category. The route
[#174](https://github.com/deepseek-ai/deepseek-harness/discussions/174) took, and
it drew the people who care about this niche. The first line of the file is the
title; the body is everything after it.

Wait for `dsh-capmark-gate` to be published to npm before posting this one, or
the install instructions point at source.

**4. [awesome-list-entry.md](awesome-list-entry.md)** — a submission to
awesome-deepseek-harness. Last, when there is a release to point at.

## Held back

**The Agent Plugins spec repo.** Permissions are declared future work there and
the `extensions["dev.capmark"]` discovery path already targets their slot, but
issue creation is restricted and a standards proposal with no adoption behind it
is noise. Revisit once the gate has users.

**Discussion #174.** It closed cleanly on 14 August with every question
answered. Reopening it to advertise would read as bumping. Its finding is cited
in the drafts instead, which credits it in the threads people are actually
reading.

## Every factual claim in these drafts was verified against a running harness

Not against docs, and not against our own unit tests. The capture is committed
at `packages/gate/test/fixtures-rc7-claims.json`:

- an unscoped `schemas()` read returns 0 tools; the scoped read returns 26
- `tools.restrict()` throws when `run_code` is named, with the quoted message
- restricting to `allow: [read]` leaves `[read, run_code]` visible
- restricting to `[read, grep]` and then to a wider `[read, grep, bash, write]`
  leaves `[read, grep]` — restrictions genuinely only narrow

The Code Mode dispatch path was traced through `dsh-tools`:
`scheduler.prepare` → `prepareScheduledExecution` → the `tools/pre-execute`
waterfall.
