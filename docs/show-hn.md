# Show HN

HN rewards plain description and punishes marketing voice. No adjectives that
cannot be checked, no "revolutionary", no emoji. The title is the whole
first impression - it must say what the thing is, not why it is good.

## Title (80 char limit)

Show HN: Capmark – capability manifests for AI agent plugins

That is 59 characters. Use the en dash; HN's own guidelines prefer it and
several `Show HN` posts get retitled for using a hyphen.

## URL

https://github.com/taltara/capmark

Submit the repo, not the npm page. HN readers want to read code.

## Text field

Installing an AI agent plugin runs someone else's code with your permissions -
it can read your files, use your credentials, and reach the network. The tools
that exist today scan for known-bad code after the fact. Capmark is the other
half: a plugin declares up front what it is allowed to do, in Markdown, and a
checker holds it to that.

The design rule is that every capability has to name a mechanism that actually
stops it. That came out of a bug report in the DeepSeek Harness community where
a deny rule on `rm -rf` was walked around with `rm` followed by `rmdir` in the
same run. Blocking a whole tool qualifies as enforcement; there is no rephrasing
your way to a shell once the shell is gone. A host allowlist does not, because
nothing checks the URL before the request goes out - so the linter reports it as
advisory rather than letting it read as a boundary.

The part I did not expect: tool schemas are re-sent on every request, so a tool
an agent can never call is paid for on every turn. Masking an agent to its
declared capabilities cut the default preset from 25 tools and 25,567 bytes to 5
tools and 2,724 bytes. It is a security feature with a large incidental win on
context budget.

Everything measured came from booting a real harness rather than computing it.
That mattered more than I expected: my arithmetic said 89.7% for one preset, the
live run said 86.2% because one tool turns out to be unmaskable. The same
approach caught three other bugs that a full unit test suite had passed,
including one where my own enforcement code masked nothing at all and reported
success.

There is a reference enforcer for DeepSeek Harness, and the manifest format
compiles to the Agent Plugins extension slot and Agent Skills frontmatter. There
is deliberately no MCP target - MCP has no field that carries this today, and
emitting one would put a security claim somewhere nothing reads.

It does not sandbox a plugin's own code. A plugin's setup function runs
in-process with full privileges before any tool call exists. Capability
manifests govern what an agent may call; deciding whether to install the plugin
at all is a separate and earlier question, which the tooling also reports on but
cannot answer for you.

MIT. Early - the format version says 0.1 and means it.

## Timing

Weekday morning US Eastern, 7-10am, is when `Show HN` has the best odds of
reaching the front page. Avoid weekends.

## In the comments

Be there for the first two hours. That matters more than the submission time.

Expect these, and answer them straight:

**"This is just a manifest, the plugin can lie."** Correct, and worth conceding
immediately. The manifest is a declaration; the gate is what makes it binding at
the tool boundary, and neither constrains the plugin's own process. Say so
plainly - the post already does.

**"Why not just use the sandbox?"** The sandbox is the enforcing layer and this
compiles into it. What the sandbox cannot express is per-plugin intent: it is
per-session, so one plugin's needs set the level for everything sharing that
session.

**"Another standard."** Fair. The answer is that it targets fields other specs
already define rather than inventing slots, and degrades to a readable security
README where nothing implements it.

**"89% of what?"** Of the tool schema payload, not the whole request. Say that
before anyone has to ask twice - conversation history dwarfs it on a long
session.

Do not ask for upvotes anywhere. HN detects voting rings and penalises them
hard, and asking in public is the fastest way to get a post killed.
