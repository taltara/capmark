Your AI agent is carrying 25 tools into every single request.

6,400 tokens. Re-sent on every turn, of every session, forever.

Most of them it will never call.

I built capmark to fix a security problem and accidentally fixed a cost one.

Here's the whole idea. A plugin declares what it's allowed to do, in Markdown:

  grant fs:read scope=workspace
  grant net:fetch
  never proc:spawn

Three lines. Now you get four things.

→ 89% smaller tool payload
Declared capabilities mean the agent only sees tools it can actually use.
25 tools became 5. 25,567 bytes became 2,724. Measured on a live harness.

→ Real enforcement, not vibes
Blocked tools are blocked. There's no rephrasing your way to a shell once the
shell is off the table.

→ Know before you install
See exactly what a plugin is asking for while saying no is still free.

→ Readable by humans, on day one
It's Markdown. Any tool that's never heard of capmark still renders a perfectly
legible security README.

The rule that makes it work: every capability must name a mechanism that
actually stops it.

That came from a real incident. A deny rule on "rm -rf" got walked around with
"rm" then "rmdir" in the same run.

Patterns deny spellings. Capabilities deny outcomes.

So a host allowlist doesn't count — nothing checks the URL before the request
goes out. capmark lints it as advisory instead of letting it pass for a wall.

A permission system that quietly overstates itself is worse than none. People
stop reading the code.

Last thing, and it's the part I'd actually tell a junior engineer.

Every number above came from booting the real thing and measuring it.

My arithmetic said 89.7%. The live run said 86.2% — one tool turned out to be
unmaskable. That same habit caught three more bugs my unit tests slept right
through.

Measure the running thing.

Free, open source, MIT → https://github.com/taltara/capmark

Built alongside a visual orchestrator for the same harness — drag models and
tools onto a canvas, get a real config file out → https://github.com/taltara/mddl-harness

#AIAgents #OpenSource #DeveloperTools #AISecurity #LLM
