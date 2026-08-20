# Twitter / X

**No link in the first post.** Links in the main tweet cut reach by 50-90% -
free accounts posting links see close to zero median engagement. The link goes
in your own first reply, posted immediately. That alone roughly doubles reach.

**No hashtags on X.** They suppress reach here, unlike LinkedIn.

Character counts below assume no link. Post the standalone first; the thread is
for if it lands.

---

## Option A — the cost hook (recommended)

Your AI agent ships 25 tools in every request.

~6,400 tokens. Every turn. Every session. Forever.

It will never call most of them.

A 3-line manifest cuts that to 5 tools and 2,724 bytes.

89% smaller. Measured on a live harness, not a spreadsheet.

↓ how it works

---

## Option B — the security hook

Someone blocked "rm -rf" in their AI agent.

The agent used "rm" then "rmdir" instead.

Patterns deny spellings. Capabilities deny outcomes.

So I built capmark: plugins declare what they're allowed to do, in Markdown,
and a checker holds them to it.

↓

---

## Option C — the one-liner

Built a permission system for AI agent plugins.

Turns out declaring what a plugin may do also cuts its tool payload by 89%.

Security feature, performance side effect.

↓

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

---

## Your first reply (post immediately, within a minute)

Free and MIT. Works with DeepSeek Harness today, and the manifest format is
harness-agnostic.

github.com/taltara/capmark

---

## Before you post

**Attach media.** A post with an image gets substantially more engagement than
text alone, and this project has an unusually good screenshot: the linter
refusing to let a manifest overstate itself. Run this and screenshot the
terminal.

The commands that produce good visuals are in the section below.

**Timing.** Tuesday to Thursday, 9-11am or 1-3pm US Eastern, is when the
developer audience is densest. Avoid Friday afternoon and weekends.

**Reply to your own replies.** Every reply you make to your own post re-surfaces
it. Answer real questions properly; that is the engagement the ranking actually
rewards.

**Pin it** to your profile while it circulates.

**Do not tag people who did not ask.** There is no confirmed official DeepSeek
Harness account on X, and cold-tagging maintainers or well-known accounts reads
as spam and can get you muted by exactly the people you want. Let the work
travel; reply to relevant conversations instead of interrupting them.

---

## Screenshot candidates

The linter refusing to overstate itself - the single most distinctive thing the
project does. This is real output, reproduced from the published package:

    mkdir cap-demo && cd cap-demo && npm init -y && npm i capmark
    printf '{"name":"vision-toolkit"}' > package.json

    cat > CAP.md <<'EOF'
    ---
    capmark: 0.1
    plugin: vision-toolkit
    ---
    ```cap
    grant fs:read scope=workspace
    grant net:fetch scope=api.example.com
    grant proc:spawn
    never proc:spawn
    ```
    EOF

    npx capmark lint ./CAP.md

produces:

    ./CAP.md:7  warning advisory-scope               scope on `net:fetch` is recorded
                                                     and audited, but nothing enforces
                                                     it - do not rely on it as a boundary
    ./CAP.md:8  warning unexplained-high-risk-grant  `proc:spawn` hands over broad
                                                     control; write a sentence saying why
    ./CAP.md:9  error   grant-never-conflict         `proc:spawn` is granted on line 8
                                                     and forbidden here

    1 error(s), 2 warning(s)

The advisory-scope line is the one worth showing. It is a tool telling you that
one of its own features is not a security boundary.

What a plugin is asking for, before you install it:

    npx capmark review ./node_modules/some-plugin

The benchmark table from the README is the other strong option, since the
numbers are the hook.

---

## Where else to post

Different rules, real traction, and worth more than any tag on X:

**Hacker News**, as a Show HN. Title: "Show HN: Capmark - capability manifests
for AI agent plugins". Post it yourself, do not ask for votes, and be present in
the comments for the first two hours. HN rewards the honest self-correction in
this project rather than punishing it.

**r/LocalLLaMA** - the most concentrated audience for agent tooling anywhere.
Lead with the token measurement, not the security pitch; that crowd cares about
context budget.

**The DeepSeek Harness Discussions** already have your Show Your Plugins post.
A reply there when capmark 0.2.0 landed is legitimate and reaches the exact
people who can use it.
