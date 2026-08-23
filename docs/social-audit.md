# Social, second wave

The first wave led with the token saving. This one leads with the audit, which
is a stronger hook and the finding that justifies the project.

## X — standalone (no link in the post; link goes in your first reply)

I audited 16 published AI agent plugins.

10 read your filesystem.
2 open network connections.
0 say so anywhere a machine can check.

None of them are doing anything wrong. That's the problem — there's no way to
tell without reading the source.

↓

## X — first reply

capmark: plugins declare what they're allowed to do, in Markdown, and a checker
holds them to it. Free, MIT, and it drafts the manifest for you.

github.com/taltara/capmark

## LinkedIn

I audited sixteen published AI agent plugins last week.

Ten of them read your filesystem. Two open network connections. Zero declare
any of it anywhere a machine can check.

I want to be precise about what that does and doesn't mean, because the
uncharitable reading is wrong.

Not one of those plugins is doing anything suspicious. A supply-chain scanner
that reads files is a scanner doing its job. Every package in that sample looks
entirely reasonable to me.

The problem is that "looks reasonable to me" required me to read their source.

That's the actual gap. Installing a plugin runs someone else's code in your
process with your permissions, and the current answer to "what will this do?"
is: go read it, or trust the README.

So I built capmark. A plugin declares what it's allowed to do, in Markdown:

  grant fs:read scope=workspace
  never proc:spawn
  never credentials:read

For most of those sixteen plugins, that file is three or four lines — and most
of the lines are `never`.

Which is the part I didn't expect. The ecosystem's problem isn't over-reaching
plugins. It's modest plugins with no way to prove they're modest.

One more thing, because it's the most useful thing I learned.

My first version of the auditor read only the framework's own dependency graph.
It reported all ten of those filesystem-reading plugins as capability-free.

Six of them inject one service and nothing else, which reads as "asks for
nothing" — while importing node:fs on the very next line.

A wrong answer in the reassuring direction is worse than no answer. My unit
tests were green the entire time. It took running the thing against sixteen real
packages to find out.

Test against reality, not against your own assumptions about it.

Open source, MIT, and the audit script reproduces the numbers from npm with
nothing executing:
https://github.com/taltara/capmark

#AIAgents #OpenSource #AISecurity #DeveloperTools #LLM
