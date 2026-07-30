# @dwg/skill-runtime

Discovers local CAD skill data packages through the public
`@dwg/skill-contracts` manifest parser. Its public entrypoint is
`@dwg/skill-runtime`.

Skill roots must remain canonically contained below the supplied discovery
directory and contain both `SKILL.md` and `manifest.json`. Instructions are
limited to 64 KiB. Both required files must be strict UTF-8: malformed or
truncated byte sequences and an initial UTF-8 BOM are rejected before parsing,
and replacement-character decoding is never used. Discovery uses the public
`@dwg/skill-contracts` and `@dwg/cad-capabilities` package entrypoints only; it
must never import CAD runtime, parser, HTTP, MCP, workspace, or provider
internals.

Incompatible capability contracts remain visible with the stable
`CAPABILITY_CONTRACT_MISMATCH` reason and are not executable by a later runtime
stage.

From the repository root, run focused tests with:

```powershell
node --import tsx --test modules/skill-runtime/tests/discovery.test.ts
npx tsc -p modules/skill-runtime/tsconfig.json --noEmit
```
