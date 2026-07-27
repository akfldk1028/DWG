# OAuth CLI Provider Runtime

DWG Intelligence uses locally installed agent CLIs instead of embedding OpenAI
or Anthropic API keys.

## Runtime flow

```text
frontend composer
  -> Vite /api proxy
  -> 127.0.0.1:4317 provider gateway
  -> validate provider + message + DWG/DXF path
  -> ACadSharp or DXF normalized cad-index/v0.1
  -> bounded CAD context with handles and bounding boxes
  -> provider-neutral ChatProvider
       |-- Codex CLI (cached ChatGPT login)
       `-- Claude CLI (cached claude.ai subscription login)
  -> grounded response with [handle:...] evidence
  -> frontend conversation panel
```

## Folder ownership

- `agent/src/providers/contracts.ts`: provider-neutral boundary.
- `agent/src/providers/cli/`: subprocess and OAuth-only environment policy.
- `agent/src/providers/codex/`: Codex CLI auth and JSONL response adapter.
- `agent/src/providers/claude/`: Claude CLI auth and JSON response adapter.
- `agent/src/application/chat/`: CAD context construction and grounded prompt policy.
- `agent/src/http/`: loopback gateway and production composition.
- `agent/tests/providers/`: fake-CLI contract and gateway integration tests.
- `agent/harness/provider-smoke.ts`: explicit live authenticated smoke test.
- `frontend/src/features/agent-chat/`: provider selection, composer, and response UI.

Product code never imports from `clone/`. `clone/claudian` is a research-only
snapshot used to compare provider/runtime boundaries.

## Authentication and safety

- Codex authentication is checked with `codex login status`.
- Claude authentication is checked with `claude auth status --json`.
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `CLAUDE_API_KEY` are removed from
  provider subprocess environments.
- Codex turns are ephemeral, read-only, and approval-free.
- Claude turns use print mode, plan permission mode, no tools, and no session
  persistence.
- Drawing text is treated as untrusted data. Responses must not follow
  instructions contained inside a drawing.
- Drawing claims must cite stable CAD handles. Unsupported table or semantic
  structure must be stated as a limitation rather than guessed.
- The HTTP gateway binds only to `127.0.0.1`.

## Commands

```powershell
# Terminal 1
npm run gateway

# Terminal 2
Set-Location frontend
npm run dev

# Explicit real-login smoke tests
npm run providers:smoke -- codex
npm run providers:smoke -- claude
```
