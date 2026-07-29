# Cross-repository integration contract

This document defines how another repository may consume DWG Intelligence
without coupling itself to implementation folders.

## Choose exactly one boundary

### 1. Contract package

Use `@dwg/contracts` when both repositories live in one workspace or when this
repository is vendored/submoduled:

```json
{
  "dependencies": {
    "@dwg/contracts": "file:../DWG/packages/contracts"
  }
}
```

The package exports CAD index, inspection, provider DTOs, validators, and
message limits from `packages/contracts/src/index.ts`. It intentionally exports
TypeScript source and is currently private; it is not a published npm package.
Import only `@dwg/contracts`: `@dwg/contracts/*` is not a public entrypoint.

Compatibility rule:

- the DWG producer emits strict `cad-index/v0.2`;
- the legacy DXF adapter may still emit `cad-index/v0.1`;
- cross-repository consumers accept the explicit v0.1/v0.2 union until the DXF
  migration is complete;
- additive optional fields are compatible;
- removing/renaming fields or changing validator behavior requires a version
  change and coordinated consumer updates.

### 2. Loopback HTTP gateway

Use loopback `/api` when the other repository is a UI, desktop shell, or
service that should not import Node implementation code.

| Method | Route | Contract |
|---|---|---|
| `GET` | `/api/health` | Gateway readiness |
| `GET` | `/api/drawing` | `CadEntityIndex` |
| `POST` | `/api/inspections` | `InspectionPayload` -> `InspectionRun` |
| `GET` | `/api/providers` | `{ providers: ProviderStatus[] }` |
| `POST` | `/api/chat` | `ProviderChatPayload` -> `ProviderChatResult` |

The gateway binds to `127.0.0.1`, rejects malformed/oversized input, and passes
browser cancellation through one `AbortSignal`. Do not expose it publicly
without adding authentication and a separate threat-model review.

| Variable | Meaning | Default |
|---|---|---|
| `DWG_WORKSPACE` | Canonical root allowed for drawing access | Current working directory |
| `DWG_DRAWING_PATH` | Drawing path relative to the workspace | Test DWG fixture |
| `DWG_GATEWAY_PORT` | Loopback gateway port | `4317` |
| `DWG_FRONTEND_PORT` | Workspace Vite port | `4173` |

### 3. MCP stdio

Use MCP stdio through `npm run mcp` for agent hosts. The supported read-only
tool surface is:

- `cad.open_drawing`
- `cad.build_index`
- `cad.get_layers`
- `cad.find_entities_by_layer`
- `cad.find_entities_by_type`
- `cad.find_text`
- `cad.get_entity`
- `cad.list_unsupported`

`cad.open_drawing` returns the `drawingId` used by later calls.
`cad.build_index` also returns that `drawingId` so chained harness steps can use
`$last.drawingId`. Viewer-only actions and write actions are not MCP tools.

MCP drawing paths use the same canonical `DWG_WORKSPACE` boundary as loopback
`/api`. Absolute paths, `..` traversal, and Windows junctions cannot escape
that root.

### 4. Whole apps/workspace composition

Use the whole apps/workspace composition when merging the three-panel product
UI. `apps/workspace/src/app` is its composition root. Its feature folders are
internal, independently owned modules rather than a component library.

If a host needs reusable UI packages, extract them deliberately in a separate
change with public entrypoints and contract tests. Do not deep-import
`apps/workspace/src/features/**` from another repository.

## Ownership and conflict zones

| Change | Required owner location |
|---|---|
| Public JSON shape/validation | `packages/contracts` |
| DWG parsing | `modules/dwg-parser` or `modules/cad-runtime/src/parsers` |
| CAD query behavior | `modules/cad-runtime/src/application/cad-tools` |
| Delegation/evidence policy | `modules/cad-runtime/src/orchestration` |
| OAuth process behavior | `modules/cad-runtime/src/providers` |
| HTTP transport/security | `modules/cad-runtime/src/http` |
| Drawing tree/layer state | `apps/workspace/src/features/drawing-explorer` |
| SVG geometry/view state | `apps/workspace/src/features/cad-viewer` |
| Chat/session state | `apps/workspace/src/features/agent-chat` |
| Inspection presentation | `apps/workspace/src/features/inspection-results` |
| Cross-feature layout/wiring | `apps/workspace/src/app` |

`modules/cad-runtime/src/**`, `apps/workspace/src/features/**`, and parser
internals are not deep-import APIs. Resolve merge conflicts at the owner
location without copying feature hooks or creating duplicate DTOs.

## Merge checklist

1. Preserve repository-relative paths; no absolute Windows path belongs in
   runtime code.
2. Install root workspace dependencies.
3. Point contract dependencies at one canonical `packages/contracts`.
4. Decide whether the host uses loopback `/api`, MCP stdio, or whole
   apps/workspace composition; do not mix deep imports with a process boundary.
5. Configure a canonical `DWG_WORKSPACE` and keep source drawings read-only.
6. Verify `npm run verify`.
7. Run browser tests on isolated ports when apps/workspace is included.
8. Inspect `docs/ui-captures/00-overview.png` after layout changes.
9. Verify live OAuth separately; default automated tests use deterministic
   fakes and do not prove current Codex/Claude login state.
