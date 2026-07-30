# @dwg/skill-contracts

Owns strict validation for versioned CAD skill manifests. Its only public
entrypoint is `@dwg/skill-contracts`; import serialized permissions from
`@dwg/contracts` through that entrypoint when needed.

This package depends only on `@dwg/contracts`. Browser code must not import it.

From the repository root, run:

```powershell
node --import tsx --test packages/skill-contracts/tests/manifest.test.ts
npx tsc -p packages/skill-contracts/tsconfig.json --noEmit
```
