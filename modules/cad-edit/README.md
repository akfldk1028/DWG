# @dwg/cad-edit

Produces deterministic, atomic in-memory previews of versioned CAD edit
commands. Its public entrypoint is `@dwg/cad-edit`.

The module depends only on `@dwg/contracts` and `@dwg/cad-document`. It clones
the supplied document snapshot, validates every revision and precondition, and
returns typed public diffs plus the preview snapshot. It does not write CAD
files, access a writer, parser, `cad-runtime`, or a workspace implementation.

Copies have no final CAD handle: their deterministic temporary ID is
`copy:<transactionId>:<commandId>:<entityIndex>` until a future writer assigns
one.

From the repository root, run:

```powershell
npm run test:edit
npx tsc -p modules/cad-edit/tsconfig.json --noEmit
```
