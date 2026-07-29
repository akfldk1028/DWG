# DWG Intelligence module boundaries

## Runtime flow

```text
packages/contracts
  <- frontend/shared + agent/domain/providers/http

frontend/app
  -> frontend/features
    -> frontend/shared/api
      -> agent/http
        -> agent/application
          -> agent/providers | agent/parsers | agent/orchestration
            -> domain
```

Imports must point inward along this flow. Provider adapters and parsers must
not import frontend or HTTP modules. `@dwg/contracts` is the only package shared
by the browser and agent runtimes.

## Folder ownership

```text
packages/contracts/
  src/cad.ts      Public cad-index/v0.1 input + typed v0.2 DTOs/validators
  src/provider.ts Public provider DTOs and transport validators

agent/src/
  domain/          Re-exports public CAD types; owns domain-only policy
  parsers/         DWG and DXF input adapters
  application/     Grounded chat and deterministic CAD use cases
  orchestration/   Named agent registry, delegation, evidence verification
  providers/
    cli/           Shared OAuth environment, process, prompt, error handling
    codex/         Codex CLI status and JSONL response adapter
    claude/        Claude CLI status and JSON response adapter
  mcp/             CAD tool protocol surface
  http/            Loopback transport only

frontend/src/
  app/             Layout composition, global scenario state, cross-feature CSS
    useWorkspaceControls.ts  Browser keyboard, popover, grid, sidebar, and artifact state
    useWorkspacePreferences.ts Persisted theme, artifact width, and sidebar sections
  features/
    drawing-explorer/  Index loading, drawing tree, layer visibility, local CSS
    cad-viewer/        Typed SVG geometry, fallback rendering, local CSS
    agent-chat/        Provider sessions, chat UI, composer, switch, local CSS
    inspection-results/ Findings, evidence, and local CSS
  shared/
    api/           Typed HTTP clients
    types.ts       Public contract re-exports plus UI-only scenario types
```

## Stable integration surfaces

Only `@dwg/contracts`, the loopback `/api` routes, MCP stdio, and the complete
frontend composition are stable cross-repository boundaries. Files under
`agent/src/**` and `frontend/src/features/**` are internal ownership units, not
deep-import APIs. See `integration-contract.md` before merging this repository
into another codebase.

## Extension rules

- Add a provider by implementing `ChatProvider`; keep shared CLI behavior in
  `providers/cli` and register the adapter in `providerRegistry.ts`.
- Add a CAD format by implementing an index adapter under `parsers`; application
  and UI consume the versioned public index union and must not depend on
  parser-specific objects. DWG emits `cad-index/v0.2`; the legacy DXF adapter
  may emit `cad-index/v0.1` during migration.
- Add an agent by declaring its identity and bounded tool set in
  `orchestration/agentRegistry.ts`; do not call provider CLIs from specialists.
- Add frontend network calls only through `shared/api`; React components do not
  call `fetch` directly.
- Public CAD/provider JSON shapes live in `packages/contracts`. Subprocess,
  `AbortSignal`, registry, cache, and parser implementation types remain inside
  the agent and must not enter the public package.
- Feature selectors live beside their owning React feature. `app/styles.css`
  owns tokens, resets, top-level layout, placement, and responsive grid rules.
- OAuth provider status is cached briefly by `CachedChatProvider`; the actual
  chat call remains uncached and provider-specific.
- Session IDs belong to the frontend chat feature and cross the provider
  contract as validated UUID strings. The browser stores one ID per provider in
  tab-scoped `sessionStorage`; application and HTTP layers only forward them.
- Layer visibility is view state in `useLayerVisibility`; it filters viewer
  rendering without mutating the normalized index or its summary counts.
- ACadSharp layout traversal, geometry extraction, and INSERT attribute
  extraction stay in the .NET backend. Contracts contain serializable evidence
  only; SVG arc/bulge conversion stays in `frontend/features/cad-viewer`.
- The v0.2 viewer displays the Model layout by default. Paper Space remains in
  the same index for layout browsing, deterministic inspection, and AI
  evidence, but is not overlaid on Model geometry.
- Cancellation flows in the opposite direction through one `AbortSignal`:
  frontend request -> HTTP gateway -> chat service -> provider -> process
  runner.

## Automated enforcement

`agent/src/architecture/moduleBoundaryChecker.ts` scans static TypeScript
imports under `packages/contracts/src`, `agent/src`, and `frontend/src`.
The default `npm test` suite rejects runtime dependencies from contracts,
agent/frontend coupling, shared-to-feature imports, and cross-feature imports.
Integration adapters must therefore meet at `@dwg/contracts`, agent application
boundaries, or frontend `shared/api` instead of bypassing module ownership.
