# @dwg/cad-capabilities

Owns the composable read, reviewed-edit, report-export, and verified Save As
CAD capability API. Its public entrypoint is
`@dwg/cad-capabilities`; consumers must not import `src/**` or use parser and
runtime implementation folders as reusable APIs.

This package consumes only the public `@dwg/contracts`, `@dwg/cad-edit`,
`@dwg/cad-query`, `@dwg/cad-export`, and `@dwg/cad-io-acadsharp` entrypoints.
Parser composition, workspace UI, and persistence remain outside the package.
The injected source resolver owns source paths; capability callers provide only
an opaque one-use destination grant and never a path, transaction, or command
lineage.

Save As writes a server-UUID temporary sibling, closes the writer, independently
reopens the temporary drawing, and verifies version, units, hashes, entity
counts, cumulative changes, copied handles, and unaffected entity evidence.
Only a passing temporary file is renamed to the unused final filename. Source
drawings are never writer destinations or overwritten; failed or cancelled
temporary files are removed or quarantined without publishing a final file.

`createEditCapabilityComposition` retains at most 20 active previews per
document. Active previews expire after 10 minutes. Terminal lifecycle evidence
(`applied`, `rejected`, `stale`, `expired`, or `evicted`) is retained in a
per-document FIFO ring of 40 IDs for 10 minutes after retirement; an ID becomes
`EDIT_PREVIEW_UNKNOWN` after either TTL or ring pruning. The optional
composition-local `now()` dependency exists for deterministic tests and defaults
to `Date.now`; production preview IDs always use `node:crypto` `randomUUID()`.

Preview responses return at most 200 typed changes and 100 warnings. Exact
`changeCount`/`warningCount` totals and `changesTruncated`/`warningsTruncated`
flags disclose omitted evidence. Full snapshots and resolved engine records are
never returned.

From the repository root, run the focused parity tests with:

```powershell
node --import tsx --test modules/cad-capabilities/tests/*.test.ts
node --import tsx --test tests/roundtrip/dxf-roundtrip.test.ts
```
