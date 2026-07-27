# DWG Intelligence module boundaries

## Runtime flow

```text
frontend/app
  -> frontend/features
    -> frontend/shared/api
      -> agent/http
        -> agent/application
          -> agent/providers | agent/parsers | agent/orchestration
            -> domain
```

Imports must point inward along this flow. Provider adapters and parsers must
not import frontend or HTTP modules.

## Folder ownership

```text
agent/src/
  domain/          Stable CAD index types
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
  app/             Layout composition and global scenario state
  features/
    drawing-explorer/  Index loading state and drawing tree
    cad-viewer/        Indexed entity rendering
    agent-chat/        Provider state, chat UI, composer, provider switch
    inspection-results/ Findings and evidence UI
  shared/
    api/           Typed HTTP clients
    types.ts       Transport-facing frontend types
```

## Extension rules

- Add a provider by implementing `ChatProvider`; keep shared CLI behavior in
  `providers/cli` and register the adapter in `providerRegistry.ts`.
- Add a CAD format by implementing an index adapter under `parsers`; application
  and UI consume `cad-index/v0.1` and must not depend on parser-specific objects.
- Add an agent by declaring its identity and bounded tool set in
  `orchestration/agentRegistry.ts`; do not call provider CLIs from specialists.
- Add frontend network calls only through `shared/api`; React components do not
  call `fetch` directly.
- OAuth provider status is cached briefly by `CachedChatProvider`; the actual
  chat call remains uncached and provider-specific.
- Session IDs belong to the frontend chat feature and cross the provider
  contract as opaque values. Application and HTTP layers must not interpret
  provider session IDs.
- Cancellation flows in the opposite direction through one `AbortSignal`:
  frontend request -> HTTP gateway -> chat service -> provider -> process
  runner.
