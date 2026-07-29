# AI clone and cross-repository handoff

This is the canonical orientation document for an AI or developer opening this
repository from another project. Read it before moving files or adding imports.

## Product truth

DWG Intelligence is a local-first, read-only CAD inspection workspace:

```text
DWG/DXF file
  -> parser adapter
  -> versioned CadEntityIndex
  -> deterministic CAD tools and inspections
  -> HTTP/MCP/provider boundary
  -> three-panel React workspace
```

The parser and normalized index own drawing truth. An LLM may select, summarize,
and explain indexed evidence, but it must not invent geometry. Object claims
must retain `handle`, `layer`, `type`, and `bbox` when available.

## Top-level ownership

```text
packages/contracts/  PUBLIC runtime-neutral DTOs, validators, limits
backend/             PRIVATE .NET/ACadSharp DWG extraction
agent/
  src/parsers/       PRIVATE DWG/DXF adapters
  src/application/   PRIVATE deterministic CAD and chat use cases
  src/orchestration/ PRIVATE specialist registry and evidence policy
  src/providers/     PRIVATE Codex/Claude OAuth CLI adapters
  src/http/          PUBLIC process boundary at loopback /api
  src/mcp/           PUBLIC read-only MCP stdio boundary
frontend/
  src/app/           whole-product composition and cross-feature wiring
  src/features/      PRIVATE independently owned UI features
  src/shared/        typed browser API clients and contract re-exports
tests/fixtures/      retained DWG fixtures and provenance
tests/visual/        retained visual baselines; test-results are local only
docs/ui-captures/    reproducible product-state PNG documentation
```

`@dwg/contracts` is the only TypeScript package shared by the browser and agent
runtimes. Agent code never imports frontend code. Frontend features never import
other features; `frontend/src/app` performs cross-feature composition.

## Choose exactly one integration mode

| Need in the host repository | Supported boundary |
|---|---|
| Shared CAD/provider types | `@dwg/contracts` |
| Local service calls | loopback `/api/*` |
| Agent-accessible CAD queries | `npm run mcp` over stdio |
| Complete product UI | merge/embed the entire `frontend` composition |

Do not combine a process boundary with deep imports from `agent/src/**` or
`frontend/src/features/**`. Do not copy DTOs into the host repository. Resolve
conflicts at the owner folder listed above.

## Clone boot sequence

From the repository root:

```powershell
npm install
npm run verify
npm run test:e2e
```

For local runtime:

```powershell
npm run gateway
npm --prefix frontend run dev
```

For an agent host:

```powershell
$env:DWG_WORKSPACE='C:\canonical\drawing-root'
npm run mcp
```

Every drawing path sent to HTTP or MCP is relative to `DWG_WORKSPACE`.
Absolute paths, traversal, and canonical junction escapes are rejected.

## Stable entrypoints

| Concern | Start here |
|---|---|
| Public exports | `packages/contracts/src/index.ts` |
| DWG index construction | `agent/src/parsers/dwg/acadSharpIndexer.ts` |
| CAD tool execution | `agent/src/application/cad-tools/runtime.ts` |
| Grounded AI context | `agent/src/application/chat/cadContextBuilder.ts` |
| HTTP process | `agent/src/http/gateway.ts` |
| MCP process | `agent/src/mcp/stdio.ts` |
| OAuth provider registration | `agent/src/providers/providerRegistry.ts` |
| UI composition root | `frontend/src/app/App.tsx` |
| Drawing and layer tree | `frontend/src/features/drawing-explorer` |
| SVG CAD rendering | `frontend/src/features/cad-viewer` |
| Chat and session state | `frontend/src/features/agent-chat` |
| Inspection results | `frontend/src/features/inspection-results` |

## Current explicit limits

- AI chat query-ranks the complete index but sends at most 200 entities to a
  provider per turn.
- The viewer renders at most 2,000 prioritized entities at once; the normalized
  index remains complete.
- Text and MTEXT values are extracted, but table row/column/cell structure is
  not currently inferred.
- DIMENSION, ELLIPSE, HATCH, SPLINE, and VIEWPORT use fallback geometry.
- OAuth integration uses existing Codex/Claude CLI login state. No API-key
  fallback is supported or stored.
- The HTTP gateway is loopback-only and has no public-network authentication.

## AI change protocol

1. Read `AGENTS.md`, this file, `module-boundaries.md`, and
   `integration-contract.md`.
2. Inspect `git status`, branch, remotes, and current package scripts.
3. Preserve source CAD files and retained visual artifacts.
4. Add or change public data only in `packages/contracts`, then update both
   consumers and compatibility tests.
5. Run Node and .NET tests sequentially on Windows.
6. Run relevant Playwright scenarios and inspect
   `docs/ui-captures/00-overview.png` after UI changes.
7. Verify live OAuth separately; deterministic tests do not prove current CLI
   authentication.
8. Never commit IDE state, credentials, local agent memory, build output, test
   reports, or worktree directories.
