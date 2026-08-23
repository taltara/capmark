Update, since two things changed that make this usable rather than aspirational.

**The chicken-and-egg is gone.** When I posted this, `capmark review` answered
"no manifest" for every plugin in the ecosystem, which made it a checker with
nothing to check. `capmark infer` now drafts a manifest from what a plugin
already declares — the `inject` array, and the Node builtins it imports — with
the evidence beside each line:

```
grant fs:read       # imports `node:fs`
grant proc:spawn    # injects `shell`
```

```sh
npx capmark infer ./node_modules/some-plugin > CAP.md
```

Correcting a draft takes a minute. Writing one from a blank file is why formats
like this usually die.

**Building it turned up something worth sharing regardless of whether you ever
use this.** I ran it across sixteen published plugins from the Security &
Governance list. Ten of them read the filesystem. Two reach the network. None
declare it, and there is no way to know from the package.

That is not a complaint about any of them — a supply-chain scanner reading files
is a scanner doing its job, and everything in that sample looks reasonable. It
is that the reader has to take it on faith.

The detail I would flag for anyone building similar tooling: my first version
read only the Cordis service graph, and it called all ten of those plugins
capability-free. Six inject `tools` and nothing else, which reads as "asks for
nothing" — while importing `node:fs` on the next line. A wrong answer in the
reassuring direction is worse than no answer, and it took an audit against real
packages to catch it. Unit tests were green throughout.

Full numbers, and the script that reproduces them from npm with nothing
executing:
<https://github.com/taltara/capmark/blob/main/docs/audit-2026-08.md>

**Verified on `0.1.0-rc.7` and `0.1.1-rc.2`.** `dsh-tools`, `dsh-agent-presets`
and `dsh-scope` are byte-identical between those versions, so the seams are the
same code at both. The tool payload measurement did move — five tool packages
edited their descriptions, and a schema is mostly its description — so the
`standard` preset is 88.0% on rc.2 rather than the 89.3% I measured on rc.7.
Both captures are committed as fixtures.

If you maintain a plugin in that sample and want the draft manifest as a PR
rather than a suggestion, say so and I will open it. The generation is the easy
part; the review is yours.
