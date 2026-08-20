# Twitter / X

Character counts below exclude the trailing link, which X shortens to 23
regardless of length. Post the standalone first; the thread is for if it lands.

---

## Option A — the cost hook (recommended)

Your AI agent ships 25 tools in every request.

~6,400 tokens. Every turn. Every session. Forever.

It will never call most of them.

A 3-line manifest cuts that to 5 tools and 2,724 bytes.

89% smaller. Measured on a live harness.

github.com/taltara/capmark

---

## Option B — the security hook

Someone blocked "rm -rf" in their AI agent.

The agent used "rm" then "rmdir" instead.

Patterns deny spellings. Capabilities deny outcomes.

So I built capmark: plugins declare what they're allowed to do, in Markdown,
and a checker holds them to it.

github.com/taltara/capmark

---

## Option C — the one-liner

Built a permission system for AI agent plugins.

Turns out declaring what a plugin may do also cuts its tool payload by 89%.

Security feature, performance side effect.

github.com/taltara/capmark

---

## Thread, if A lands

1/
Your AI agent ships 25 tools in every request.

~6,400 tokens. Every turn. Every session. Forever.

It will never call most of them.

2/
The fix is a file. A plugin says what it's allowed to do:

grant fs:read
grant net:fetch
never proc:spawn

Tools outside that never reach the model. 25 → 5. 89% smaller payload.

3/
One rule makes it real: every capability must name a mechanism that actually
stops it.

Blocking a tool counts. There's no rephrasing your way to a shell once the
shell is gone.

A host allowlist doesn't. Nothing checks the URL before the request goes out.

4/
So the linter says so:

warning: scope on net:fetch is recorded and audited, but nothing enforces it

A permission system that quietly overstates itself is worse than none.

People stop reading the code.

5/
Best part: my arithmetic said 89.7%.

The live harness said 86.2%. One tool turned out to be unmaskable.

Same habit caught 3 more bugs my unit tests slept through.

Measure the running thing.

6/
Free, MIT, works today.

github.com/taltara/capmark
