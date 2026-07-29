# DWG Intelligence

Local-first DWG/DXF inspection workspace. A deterministic parser produces a
versioned CAD index; agents and OAuth CLI providers may reason over that index,
but never invent or directly decode drawing geometry.

![Workspace overview](docs/ui-captures/00-overview.png)

## Start here

Requirements: Node.js 24+, npm, .NET 9 SDK, and Playwright Chromium for browser
tests.

```powershell
npm install
npm run verify
npm run test:e2e
```

The default `npm test` suite includes fixture hash integrity checks.
`npm run test:fixtures` remains available for a targeted fixture-only run.

Run the local application in two terminals:

```powershell
npm run gateway
```

```powershell
npm --workspace @click-around/workspace run dev
```

Default URLs are `http://127.0.0.1:4317/api/health` and
`http://127.0.0.1:4173/`. Override them with `DWG_GATEWAY_PORT` and
`DWG_FRONTEND_PORT`.

## Repository map

| Path | Owner | Cross-repository access |
|---|---|---|
| `packages/contracts` | Runtime-neutral DTOs and validators | Public: `@dwg/contracts` |
| `modules/dwg-parser` | ACadSharp DWG parsing and normalized geometry extraction | Internal parser implementation |
| `modules/cad-runtime/src/parsers` | DWG/DXF adapters | Internal; returns contract DTOs |
| `modules/cad-runtime/src/application` | Deterministic CAD tools and grounded chat use cases | Internal application boundary |
| `modules/cad-runtime/src/http` | Loopback gateway | Public process boundary: loopback `/api` |
| `modules/cad-runtime/src/mcp` | Read-only CAD MCP tools | Public process boundary: MCP stdio |
| `modules/cad-runtime/src/providers` | Existing Codex/Claude OAuth CLI adapters | Internal `ChatProvider` implementations |
| `apps/workspace/src/app` | Three-panel composition and workspace controls | Public only as the whole apps/workspace composition |
| `apps/workspace/src/features` | Drawing, viewer, chat, and inspection feature owners | Internal feature modules |

Supported reuse surfaces are `@dwg/contracts`, loopback `/api`, MCP stdio, and
whole apps/workspace composition. Do not deep-import
`modules/cad-runtime/src/**`, `apps/workspace/src/features/**`, or parser
internals.

## Architecture and handoff

- [Repository instructions for AI agents](AGENTS.md)
- [AI clone and cross-repository handoff](docs/architecture/ai-clone-handoff.md)
- [Module ownership and import rules](docs/architecture/module-boundaries.md)
- [Cross-repository integration contract](docs/architecture/integration-contract.md)
- [OAuth CLI provider boundary](docs/architecture/oauth-cli-providers.md)
- [Reproducible UI captures](docs/ui-captures/README.md)
- [Fixture provenance](tests/fixtures/dwg/README.md)

Source DWG/DXF files are read-only. Object-level claims must be grounded with
stable handles, layers, types, and bounding boxes from the versioned CAD
contract: DWG emits `cad-index/v0.2`; legacy DXF may emit `cad-index/v0.1`.

When cloning this repository into another project, choose exactly one supported
reuse surface. Do not deep-import internal parser, runtime, or workspace
feature folders, and do not duplicate public DTOs.
