Installing an AI agent plugin runs a stranger's code with your permissions. It
can read your files, spend your credentials, and reach the network.

Today the only thing standing between you and that is a README and your own
reading of it.

So I built capmark: a plugin declares what it may do, in Markdown, and a checker
holds it to that.

  grant fs:read scope=workspace
  grant net:fetch
  never proc:spawn

One rule keeps it honest — every capability has to name a mechanism that
actually stops it.

That rule came from a real finding in the DeepSeek Harness community: a deny
rule on "rm -rf" was walked around with "rm" followed by "rmdir" in the same
run. Patterns deny spellings. Capabilities deny outcomes.

Blocking a whole tool qualifies — there is no rephrasing your way to a shell
once the shell is off the table. A host allowlist does not, because nothing
checks the URL before the request goes out. So the linter says so out loud
rather than letting it pass for a wall.

A permission system that quietly overstates itself is worse than none, because
people stop reading the code.

Then the surprise.

Tool schemas are re-sent on every single request, so a tool an agent can never
call is paid for on every turn of every session. I measured a running harness:
the default agent carries 25 tools in 25,567 bytes — roughly 6,400 tokens, every
request. A plugin that only reads files and makes one network call justifies 5
of them.

An 89% cut to the tool payload, from a file written for security reasons.

I went in thinking this was a safety feature. I came out thinking the cost
argument might be the easier sell.

One more thing worth sharing. Every number here came from booting a real harness
and measuring it, not from arithmetic — and that is the only reason they are
right. My paper calculation said 89.7% for one configuration. The live run said
86.2%, because one tool turns out to be unmaskable. The same habit caught three
other bugs that my unit tests sailed straight through.

Measure the running thing.

Open source, MIT:
https://github.com/taltara/capmark

Built alongside a visual orchestrator for the same harness — drag models and
tools onto a canvas, and it compiles to a real config overlay:
https://github.com/taltara/mddl-harness

#AIAgents #OpenSource #DeveloperTools #AISecurity #LLM
