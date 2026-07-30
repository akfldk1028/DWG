import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { CadOutputVerification, InspectionRun } from "@dwg/contracts";
import type { CadDocumentSnapshot } from "@dwg/cad-document";
import { exportCadReport, type CadReportInput } from "../src/index.js";

const transactionIds = [
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000001"
] as const;

test("exports stable ordered JSON with the full cumulative change set", async () => {
  const report = await exportCadReport(input(), "json");
  const repeated = await exportCadReport(input(), "json");
  const decoded = JSON.parse(new TextDecoder().decode(report.bytes)) as {
    changeSet: { transactionIds: string[]; changes: Array<{ commandId: string; kind: string }> };
  };

  assert.equal(report.mediaType, "application/json; charset=utf-8");
  assert.equal(report.filename, "unsafe-name-rev-2-report.json");
  assert.deepEqual(decoded.changeSet.transactionIds, [...transactionIds].sort());
  assert.deepEqual(
    decoded.changeSet.changes.map((change) => [change.commandId, change.kind]),
    [
      ["10000000-0000-4000-8000-000000000001", "entity.move"],
      ["10000000-0000-4000-8000-000000000002", "text.replace"]
    ]
  );
  assert.equal(report.sha256, repeated.sha256);
  assert.deepEqual(report.bytes, repeated.bytes);
  assert.equal(report.sha256, sha256(report.bytes));
});

test("uses bytewise key ordering instead of host locale collation", async () => {
  const report = await exportCadReport(input(), "json");
  const text = new TextDecoder().decode(report.bytes);

  assert.ok(text.indexOf('"z":"last"') < text.indexOf('"ä":"umlaut"'));
});

test("exports UTF-8 CSV with spreadsheet formulas made literal", async () => {
  const report = await exportCadReport(input("=SUM(1,1)"), "csv");
  const text = new TextDecoder().decode(report.bytes);

  assert.equal(report.mediaType, "text/csv; charset=utf-8");
  assert.equal(report.filename, "unsafe-name-rev-2-report.csv");
  assert.deepEqual([...report.bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(text, /'=SUM\(1,1\)/u);
  assert.match(text, /'\+formula/u);
  assert.match(text, /'-formula/u);
  assert.match(text, /'@formula/u);
  assert.match(text, /00000000-0000-4000-8000-000000000001/u);
  assert.match(text, /entity\.move/u);
});

test("exports a deterministic PDF 1.7 report without an external renderer", async () => {
  const report = await exportCadReport(input(), "pdf");
  const repeated = await exportCadReport(input(), "pdf");
  const text = new TextDecoder().decode(report.bytes);

  assert.equal(report.mediaType, "application/pdf");
  assert.equal(report.filename, "unsafe-name-rev-2-report.pdf");
  assert.match(text, /^%PDF-1\.7\n/u);
  assert.match(text, /Unsupported geometry: spline/u);
  assert.match(text, /%%EOF\n$/u);
  assert.deepEqual(report.bytes, repeated.bytes);
  assert.equal(report.sha256, sha256(report.bytes));
});

test("exports valid SVG while explicitly retaining unsupported geometry", async () => {
  const report = await exportCadReport(input(), "svg");
  const text = new TextDecoder().decode(report.bytes);

  assert.equal(report.mediaType, "image/svg+xml; charset=utf-8");
  assert.equal(report.filename, "unsafe-name-rev-2-report.svg");
  assert.match(text, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/u);
  assert.match(text, /Unsupported geometry: spline/u);
  assert.match(text, /00000000-0000-4000-8000-000000000001/u);
  assert.match(text, /entity\.move/u);
  assert.match(text, /<line /u);
  assert.doesNotMatch(text, /<path /u);
});

test("rejects report bytes beyond the bounded export ceiling", async () => {
  const overlong = input("x".repeat(1_048_577));

  await assert.rejects(
    exportCadReport(overlong, "json"),
    /EXPORT_REPORT_BYTE_LIMIT/u
  );
});

function input(formula = "@formula"): CadReportInput {
  return {
    document: documentSnapshot(),
    findings: findings(formula),
    changeSet: {
      documentId: "drawing:unsafe<>:/\\name",
      revision: 2,
      transactionIds: [...transactionIds],
      changes: [
        {
          commandId: "10000000-0000-4000-8000-000000000002",
          kind: "text.replace",
          targetId: "h:20",
          before: { id: "h:20", handle: "20", type: "TEXT", layer: "A", bbox: null, text: "before" },
          after: { id: "h:20", handle: "20", type: "TEXT", layer: "A", bbox: null, text: formula }
        },
        {
          commandId: "10000000-0000-4000-8000-000000000001",
          kind: "entity.move",
          targetId: "h:10",
          before: { id: "h:10", handle: "10", type: "LINE", layer: "0", bbox: { min: [0, 0, 0], max: [1, 1, 0] }, text: null },
          after: { id: "h:10", handle: "10", type: "LINE", layer: "0", bbox: { min: [2, 0, 0], max: [3, 1, 0] }, text: null }
        }
      ]
    },
    verification: verification()
  };
}

function documentSnapshot(): CadDocumentSnapshot {
  return {
    documentId: "drawing:unsafe<>:/\\name",
    revision: 2,
    sourceSha256: "A".repeat(64),
    drawingVersion: "AC1032",
    units: "Millimeters",
    index: {
      schemaVersion: "cad-index/v0.2",
      drawingId: "drawing:unsafe<>:/\\name",
      source: { kind: "dxf", displayName: "unsafe<>:/\\name.dxf", parser: "fixture" },
      summary: { entityCount: 2, layerCount: 1, unsupportedCount: 1, modelSpaceCount: 2, paperSpaceCount: 0 },
      drawing: { fileVersion: "AC1032", units: "Millimeters" },
      layers: [{ name: "0", entityCount: 2, visible: true, frozen: false, color: 7, locked: false }],
      unsupported: [{ type: "SPLINE", count: 1, reason: "spline" }],
      entities: [
        {
          id: "h:20", handle: "20", type: "TEXT", layer: "0", space: "model", layout: "Model",
          bbox: { min: [0, 0, 0], max: [0, 0, 0] }, text: "=SUM(1,1)", blockName: null, attributes: {}, warnings: [],
          geometry: { kind: "text", insertionPoint: [0, 0, 0], alignmentPoint: null, height: 1, rotation: 0, width: null }
        },
        {
          id: "h:10", handle: "10", type: "LINE", layer: "0", space: "model", layout: "Model",
          bbox: { min: [1, 0, 0], max: [2, 1, 0] }, text: "+formula", blockName: null, attributes: {}, warnings: [],
          geometry: { kind: "line", start: [1, 0, 0], end: [2, 1, 0] }
        },
        {
          id: "h:30", handle: "30", type: "SPLINE", layer: "0", space: "model", layout: "Model",
          bbox: null, text: "-formula", blockName: null, attributes: {}, warnings: [],
          geometry: { kind: "unavailable", reason: "spline" }
        }
      ]
    },
    layers: [{ id: "layer:imported:MA", name: "0", color: 7, visible: true, frozen: false, locked: false }]
  };
}

function findings(formula: string): InspectionRun {
  return {
    status: "completed",
    drawingId: "drawing:unsafe<>:/\\name",
    events: [],
    findings: [{ id: "finding:1", handle: "20", type: "TEXT", layer: "0", bbox: null, text: formula, reason: "-formula", confidence: 1 }],
    issues: [],
    warnings: ["+formula", "-formula", "@formula"]
  };
}

function verification(): CadOutputVerification {
  return {
    id: "verification:1",
    status: "passed",
    format: "dxf",
    version: "AC1032",
    sourceSha256: "A".repeat(64),
    outputSha256: "B".repeat(64),
    intendedChangeCount: 2,
    verifiedChangeCount: 2,
    copiedHandleMap: { z: "last", ä: "umlaut", "10": "110", "20": "120" },
    warnings: []
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}
