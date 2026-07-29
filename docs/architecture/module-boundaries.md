# DWG Intelligence module boundaries

## Runtime flow

```text
packages/contracts
  <- apps/workspace/src/shared + modules/cad-runtime/src/domain/providers/http

apps/workspace/src/app
  -> apps/workspace/src/features
    -> apps/workspace/src/shared/api
      -> loopback /api
        -> modules/cad-runtime/src/http
          -> modules/cad-runtime/src/application
            -> modules/cad-runtime/src/providers | parsers | orchestration
              -> modules/dwg-parser
```

Imports point inward along this flow. Runtime adapters and parsers do not
import workspace code. `@dwg/contracts` is the only TypeScript package shared
by the workspace and CAD runtime.

## Folder ownership

```text
packages/contracts/
  src/index.ts    Sole public TypeScript implementation entrypoint
  src/cad.ts      Public cad-index/v0.1 input + typed v0.2 DTOs/validators
  src/provider.ts Public provider DTOs and transport validators

modules/dwg-parser/
  src/            PRIVATE .NET/ACadSharp extraction

modules/cad-runtime/src/
  domain/          Re-exports public CAD types; owns domain-only policy
  parsers/         PRIVATE DWG and DXF input adapters
  application/     Grounded chat and deterministic CAD use cases
  orchestration/   Named runtime registry, delegation, evidence verification
  providers/       Existing Codex/Claude OAuth CLI adapters
  mcp/             MCP stdio process boundary
  http/            Loopback /api transport only

apps/workspace/src/
  app/             Layout composition, global scenario state, cross-feature CSS
  features/        PRIVATE independently owned UI features
  shared/          Typed loopback API clients and contract re-exports
```

`apps/workspace/src/app/useWorkspaceControls.ts` owns global browser controls.
`useWorkspacePreferences.ts` owns persisted theme, panel width, and sidebar
section preferences.

## Stable integration surfaces

Only these reuse surfaces are stable across repositories:

- `@dwg/contracts`
- loopback `/api`
- MCP stdio
- whole apps/workspace composition

`modules/cad-runtime/src/**`, `apps/workspace/src/features/**`, and parser
internals are not deep-import APIs. The contracts package must be imported only
as `@dwg/contracts`; `@dwg/contracts/*` is rejected. See
`integration-contract.md` before merging this repository into another codebase.

## Extension rules

- Add a provider by implementing `ChatProvider`; keep shared CLI behavior in
  `modules/cad-runtime/src/providers/cli` and register the adapter in its
  provider registry.
- Add a CAD format under `modules/cad-runtime/src/parsers`; applications and
  workspace code consume the versioned public index union, never parser objects.
  DWG emits `cad-index/v0.2`; the legacy DXF adapter may emit `cad-index/v0.1`.
- Add runtime specialists in `modules/cad-runtime/src/orchestration`; do not
  call provider CLIs from specialists.
- Add workspace network calls only through `apps/workspace/src/shared/api`;
  React components do not call `fetch` directly.
- Public CAD/provider JSON shapes live in `packages/contracts`. Subprocess,
  `AbortSignal`, registry, cache, and parser types remain internal.
- Feature selectors live beside their owning workspace feature. App styles own
  tokens, resets, top-level layout, placement, and responsive grid rules.
- ACadSharp layout traversal and geometry extraction stay in
  `modules/dwg-parser`. Contracts contain serializable evidence only; SVG
  arc/bulge conversion stays in `apps/workspace/src/features/cad-viewer`.
- Cancellation flows through one `AbortSignal`: workspace request -> loopback
  gateway -> chat service -> provider -> process runner.

## Automated enforcement

`modules/cad-runtime/src/architecture/moduleBoundaryChecker.ts` scans static
imports, re-exports, and string-literal dynamic imports under
`packages/contracts/src`, `modules/cad-runtime/src`, and `apps/workspace/src`.
The default `npm test` suite rejects runtime dependencies from contracts,
workspace/runtime coupling, shared-to-feature imports, feature-to-feature
imports, and `@dwg/contracts/*` deep imports. External package imports are
outside this repository-boundary scan.
