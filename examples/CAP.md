---
capmark: 0.1
plugin: dsh-vision-toolkit
---

# Capabilities

```cap
grant fs:read scope=workspace
grant net:fetch
```

# Contracts

```cap
never proc:spawn
never plugins:manage
require approval for fs:read
```

# Rationale

Vision OCR reads image files from the workspace and calls a hosted model to
describe them. It never runs a shell command and never mounts a plugin.

The `net:fetch` grant is unscoped on purpose. A host list would read like a
firewall, and nothing in the harness checks the URL before the tool body runs —
so the honest declaration is "this plugin reaches the network", and the host
list lives in this paragraph where nobody will mistake it for enforcement:
`api.moondream.ai` and `huggingface.co`.
