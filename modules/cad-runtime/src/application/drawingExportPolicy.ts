import type { DrawingFormat } from "@dwg/contracts";

// Save As writes a copy and then proves the copy matches the active document.
// That proof only holds when both sides come from one parser and one entity
// model, which means the output format must match the format the source was
// read as. A DWG read through ACadSharp cannot be proven against DXF output:
// ACadSharp derives a different bounding box for fallback-geometry entities
// when it reads DXF, so a faithful copy still reports a changed HATCH extent.
// A DXF read through the legacy indexer cannot be proven against DWG output at
// all, because the two indexers emit different schema versions. Rather than
// weaken output verification, the mismatched directions are withheld.
export function drawingExportUnavailableReason(
  sourceFormat: DrawingFormat | null,
  format: DrawingFormat
): string | null {
  if (sourceFormat === null || sourceFormat === format) return null;
  return `${format.toUpperCase()} drawing export is withheld for a ${sourceFormat.toUpperCase()} source because the copy cannot be verified against it.`;
}

export function isDrawingExportAvailable(
  sourceFormat: DrawingFormat | null,
  format: DrawingFormat
): boolean {
  return drawingExportUnavailableReason(sourceFormat, format) === null;
}
