# ACadSharp CAD I/O adapter

`DwgIntelligence.CadIo` is the sole owner of ACadSharp document-to-index
mapping: layout traversal, normalized geometry extraction, insert attributes,
and the DWG index builder. `modules/dwg-parser` is the thin read executable
that invokes this adapter and serializes its index.

The adapter is internal implementation code. Its output remains the existing
`cad-index/v0.2` serialized shape consumed through the parser process.
