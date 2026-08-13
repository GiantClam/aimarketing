# OpenCode resident-session feasibility spike

This isolated Windows probe validates the OpenSpec resident OpenCode contract without modifying production paths. It uses UTF-8 throughout, allocates a random loopback port, generates random Basic Auth credentials, disables mDNS/CORS opt-ins, and writes redacted evidence under `evidence/`.

## Reproduce

From PowerShell at the repository root:

```powershell
& .\scripts\desktop-spikes\opencode-session\Test-OpenCodeSpike.ps1
& .\scripts\desktop-spikes\opencode-session\Invoke-OpenCodeSpike.ps1 -ProvisionPrivate -Model "provider/model"
```

The private candidate is pinned to `opencode-ai@1.18.14`, matching the repository runtime image. Override it with `-PrivateVersion`. `-Model` (or `OPENCODE_SPIKE_MODEL`) selects a configured provider/model explicitly. The harness copies only that provider's configuration/auth entry into a per-run OS temporary directory, removes inherited ACLs, grants access only to the current Windows identity, and deletes the directory in `finally`; credentials never enter the repository or evidence. Set `OPENCODE_SYSTEM_PATH` or `OPENCODE_PRIVATE_PATH` to test an explicit executable. Private packages remain ignored inside this directory.

## Verdict semantics

- `transport`: health, authentication rejection, session creation, SSE connection, abort endpoint, child exit, and restart.
- `modelBacked`: same-session prompts, streamed text, tool phases, usage, and cancellation of an active prompt.
- Missing or invalid provider/model credentials block only model-backed checks; they do not erase transport evidence.
- The desktop Electron executable is detected and fingerprinted, but is not launched as a serve candidate because it does not expose the supported CLI contract.

Evidence never contains executable paths, generated credentials, authorization headers, user names, provider keys, or raw environment variables.
