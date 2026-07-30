# @dwg/cad-capabilities

Owns the read-only, composable CAD capability API. Its public entrypoint is
`@dwg/cad-capabilities`; consumers must not import `src/**` or use parser and
runtime implementation folders as reusable APIs.

This package may depend only on `@dwg/contracts`. Parser, workspace, process,
and persistence concerns are supplied by `ReadCapabilityDependencies`, so this
module does not own a CAD runtime or a drawing workspace.

From the repository root, run the focused parity tests with:

```powershell
node --import tsx --test modules/cad-capabilities/tests/read-capabilities.test.ts modules/cad-runtime/tests/integration/mcp-server.test.ts
```
