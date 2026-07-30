# @dwg/cad-capabilities

Owns the composable read and reviewed-edit CAD capability API. Its public entrypoint is
`@dwg/cad-capabilities`; consumers must not import `src/**` or use parser and
runtime implementation folders as reusable APIs.

This package depends only on `@dwg/contracts` and the public `@dwg/cad-edit`
entrypoint. Parser, workspace, process, and persistence concerns remain outside
the package.

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
```
