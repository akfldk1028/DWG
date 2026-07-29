# Cross-repository integration contract

This document defines how another repository may consume DWG Intelligence
without coupling itself to implementation folders.

## Choose one boundary

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

Compatibility rule:

- the DWG producer emits strict `cad-index/v0.2`;
- the legacy DXF adapter may still emit `cad-index/v0.1`;
- cross-repository consumers must accept the explicit v0.1/v0.2 union until
  the DXF migration is complete;
- additive optional fields are compatible;
- removing/renaming fields or changing validator behavior requires a version
  change and coordinated consumer updates.

### 2. Loopback HTTP gateway

Use the gateway when the other repository is a UI, desktop shell, or service
that should not import Node implementation code.

| Method | Route | Contract |
|---|---|---|
| `GET` | `/api/health` | Gateway readiness |
| `GET` | `/api/drawing` | `CadEntityIndex` |
| `POST` | `/api/inspections` | `InspectionPayload` → `InspectionRun` |
| `GET` | `/api/providers` | `{ providers: ProviderStatus[] }` |
| `POST` | `/api/chat` | `ProviderChatPayload` → `ProviderChatResult` |

The gateway binds to `127.0.0.1`, rejects malformed/oversized input, and passes
browser cancellation through one `AbortSignal`. Do not expose it publicly
without adding authentication and a separate threat-model review.

Environment:

| Variable | Meaning | Default |
|---|---|---|
| `DWG_WORKSPACE` | Canonical root allowed for drawing access | Current working directory |
| `DWG_DRAWING_PATH` | Drawing path relative to the workspace | Test DWG fixture |
| `DWG_GATEWAY_PORT` | Loopback gateway port | `4317` |
| `DWG_FRONTEND_PORT` | Vite frontend port | `4173` |

### 3. MCP stdio

Use `npm run mcp` for agent hosts. The supported read-only tool surface is:

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
`$last.drawingId`. Viewer-only actions such as select/zoom and write actions
such as save-sidecar are not currently MCP tools.

### 4. Whole frontend

Use the whole `frontend` application when merging the Claude-style workspace.
`frontend/src/app` is the composition root. Its feature folders are internal,
independently owned modules rather than a component library.

If a host needs reusable UI packages, extract them deliberately in a separate
change with public entrypoints and contract tests. Do not deep-import
`frontend/src/features/**` from another repository.

## Ownership and conflict zones

| Change | Required owner location |
|---|---|
| Public JSON shape/validation | `packages/contracts` |
| DWG/DXF parsing | `backend` or `agent/src/parsers` |
| CAD query behavior | `agent/src/application/cad-tools` |
| Agent delegation/evidence policy | `agent/src/orchestration` |
| OAuth process behavior | `agent/src/providers` |
| HTTP transport/security | `agent/src/http` |
| Drawing tree/layer state | `frontend/src/features/drawing-explorer` |
| SVG geometry/view state | `frontend/src/features/cad-viewer` |
| Chat/session state | `frontend/src/features/agent-chat` |
| Inspection presentation | `frontend/src/features/inspection-results` |
| Cross-feature layout/wiring | `frontend/src/app` |

Resolve merge conflicts at the owner location. Do not solve conflicts by
creating duplicate DTOs, copying feature hooks, or introducing feature-to-
feature imports.

## Merge checklist

1. Preserve repository-relative paths; no absolute Windows path belongs in
   runtime code.
2. Install root and frontend dependencies.
3. Point contract dependencies at one canonical `packages/contracts`.
4. Decide whether the host uses HTTP, MCP, or the whole frontend; do not mix
   deep imports with a process boundary.
5. Configure a canonical `DWG_WORKSPACE` and keep source drawings read-only.
6. Verify `npm run verify`.
7. Run browser tests on isolated ports when the frontend is included.
8. Inspect `docs/ui-captures/00-overview.png` after layout changes.
9. Verify live OAuth separately; default automated tests use deterministic
   fakes and do not prove current Codex/Claude login state.
