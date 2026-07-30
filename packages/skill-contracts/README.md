# @dwg/skill-contracts

Owns strict validation for versioned CAD skill manifests. Its only public
entrypoint is `@dwg/skill-contracts`; import serialized permissions from
`@dwg/contracts` through that entrypoint when needed.

Its runtime dependencies are `@dwg/contracts` and Zod. `@dwg/contracts` is its
only internal `@dwg/*` dependency. Browser code must not import this package.

From the repository root, run:

```powershell
node --import tsx --test packages/skill-contracts/tests/manifest.test.ts
npx tsc -p packages/skill-contracts/tsconfig.json --noEmit
```
