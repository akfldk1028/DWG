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
  -> loopback /api, MCP stdio, or provider boundary
  -> three-panel apps/workspace UI
```

The parser and normalized index own drawing truth. An LLM may select, summarize,
and explain indexed evidence, but it must not invent geometry. Object claims
retain `handle`, `layer`, `type`, and `bbox` when available.

## Top-level ownership

```text
packages/contracts/              PUBLIC runtime-neutral DTOs, validators, limits
modules/dwg-parser/              PRIVATE .NET/ACadSharp DWG extraction
modules/cad-runtime/src/
  parsers/                       PRIVATE DWG/DXF adapters
  application/                   PRIVATE deterministic CAD and chat use cases
  orchestration/                 PRIVATE specialist registry and evidence policy
  providers/                     PRIVATE Codex/Claude OAuth CLI adapters
  http/                          loopback /api process boundary
  mcp/                           read-only MCP stdio process boundary
apps/workspace/src/
  app/                           whole-product composition and cross-feature wiring
  features/                      PRIVATE independently owned UI features
  shared/                        typed browser API clients and contract re-exports
tests/fixtures/                  retained DWG fixtures and provenance
tests/visual/                    retained visual baselines; test-results are local only
docs/ui-captures/                reproducible product-state PNG documentation
```

`@dwg/contracts` is the only TypeScript package shared by workspace and CAD
runtime code. Runtime code never imports workspace code. Workspace features do
not import other workspace features; `apps/workspace/src/app` performs
cross-feature composition.

## Choose exactly one integration mode

| Need in the host repository | Supported boundary |
|---|---|
| Shared CAD/provider types | `@dwg/contracts` |
| Local service calls | loopback `/api` |
| Agent-accessible CAD queries | MCP stdio via `npm run mcp` |
| Complete product UI | whole apps/workspace composition |

`modules/cad-runtime/src/**`, `apps/workspace/src/features/**`, and parser
internals are not deep-import APIs. Do not copy DTOs into the host repository.
Resolve conflicts at the owner folder listed above.

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
npm --workspace @click-around/workspace run dev
```

For an agent host:

```powershell
$env:DWG_WORKSPACE='C:\canonical\drawing-root'
npm run mcp
```

Every drawing path sent to HTTP or MCP is relative to `DWG_WORKSPACE`.
Absolute paths, traversal, and canonical junction escapes are rejected.

## Owner entrypoints

| Concern | Owner location |
|---|---|
| Public exports | `packages/contracts/src/index.ts` via `@dwg/contracts` |
| DWG index construction | `modules/cad-runtime/src/parsers/dwg/acadSharpIndexer.ts` |
| CAD tool execution | `modules/cad-runtime/src/application/cad-tools/runtime.ts` |
| Grounded AI context | `modules/cad-runtime/src/application/chat/cadContextBuilder.ts` |
| HTTP process | `modules/cad-runtime/src/http/gateway.ts` |
| MCP process | `modules/cad-runtime/src/mcp/stdio.ts` |
| OAuth provider registration | `modules/cad-runtime/src/providers/providerRegistry.ts` |
| UI composition root | `apps/workspace/src/app/App.tsx` |
| Workspace features | `apps/workspace/src/features` |

These locations are ownership navigation, not cross-repository import APIs.

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
