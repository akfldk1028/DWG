# @dwg/cad-query

Grounded, deterministic read-only schedule extraction and drawing comparison.

Public entrypoint: `@dwg/cad-query`. It may depend only on `@dwg/contracts`.
It must not import parser, CAD runtime, workspace, HTTP, MCP, or provider internals.

`extractCadSchedule` derives rows only from indexed `TEXT` and `MTEXT` entities
with non-null handles and bounding boxes. It groups deterministic Y bands and
sorts cells by X; it does not infer native table rows, columns, or cells.

`compareCadDrawings` matches non-null handles first, then unmatched entities
without handles by stable ID. Its serialized result exposes only typed evidence.

Run focused tests:

```powershell
node --import tsx --test "modules/cad-query/tests/*.test.ts"
```
