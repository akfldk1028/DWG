# @dwg/cad-export

Deterministic, local report serialization for a `CadDocumentSnapshot`. This module
owns report-only application input and does not publish it through
`@dwg/contracts`; the public serialized DTOs remain in `@dwg/contracts`.

Dependencies point only to public package entrypoints: `@dwg/cad-document` for
the in-memory snapshot and `@dwg/contracts` for serialized evidence. It never
imports the workspace, runtime, parser, browser APIs, or native exporters.

`exportCadReport` produces UTF-8 JSON/CSV/SVG or text-first PDF 1.7 bytes with
stable ordering and SHA-256. CSV protects formula-leading cells, filenames are
sanitized, and every report is limited to 1 MiB. SVG/PDF render only known line
geometry; all other geometry is explicitly reported as unsupported.

Run focused tests with:

```powershell
node --import tsx --test modules/cad-export/tests/report-export.test.ts
```
