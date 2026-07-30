import type { CadIoWriteResult } from "@dwg/cad-io-acadsharp";
import type { CadSaveState } from "@dwg/cad-edit";
import {
  parseCadOutputVerification,
  type CadEntityIndex,
  type CadEntityIndexItem,
  type CadOutputVerification
} from "@dwg/contracts";

import {
  CadSaveError,
  type CadParsedDocumentEvidence
} from "./contracts.js";

const BBOX_TOLERANCE = 0.000001;

export function verifySavedOutput(input: {
  verificationId: string;
  format: "dxf" | "dwg";
  requestedVersion: string;
  outputSha256: string;
  saveState: CadSaveState;
  writer: CadIoWriteResult;
  reopened: CadParsedDocumentEvidence;
  expectedTemporaryIds: readonly string[];
}): CadOutputVerification {
  try {
    verifyMetadata(input);
    verifyCounts(input);
    verifyCopiedHandles(input);
    verifyEntities(input);
    verifyLayers(input.saveState.current.index, input.reopened.index);
    verifyWarnings(input.saveState.current.index, input.reopened.index);
    const intendedChangeCount = input.saveState.lineage.reduce(
      (total, transaction) => total + transaction.changes.length,
      0
    );
    return parseCadOutputVerification({
      id: input.verificationId,
      status: "passed",
      format: input.format,
      version: input.requestedVersion,
      sourceSha256: input.saveState.source.sourceSha256,
      outputSha256: input.outputSha256,
      intendedChangeCount,
      verifiedChangeCount: intendedChangeCount,
      copiedHandleMap: sortRecord(input.writer.copiedHandleMap),
      warnings: [...new Set(input.writer.warnings)].sort(compareText)
    });
  } catch (error) {
    if (error instanceof CadSaveError) throw error;
    throw new CadSaveError("CAD_SAVE_VERIFICATION_FAILED");
  }
}

function verifyMetadata(input: Parameters<typeof verifySavedOutput>[0]): void {
  if (
    input.writer.format !== input.format
    || input.writer.version !== input.requestedVersion
    || input.reopened.drawingVersion !== input.requestedVersion
    || input.reopened.units !== input.saveState.current.units
    || upperHash(input.reopened.sourceSha256) !== upperHash(input.outputSha256)
  ) {
    fail();
  }
}

function verifyCounts(input: Parameters<typeof verifySavedOutput>[0]): void {
  const sourceCount = input.saveState.source.index.entities.length;
  const currentCount = input.saveState.current.index.entities.length;
  const reopenedCount = input.reopened.index.entities.length;
  const delta = input.saveState.lineage.flatMap((transaction) => transaction.changes)
    .reduce((total, change) => {
      if (change.kind === "entity.copy") return total + 1;
      if (change.kind === "entity.delete") return total - 1;
      return total;
    }, 0);
  if (
    sourceCount + delta !== currentCount
    || input.writer.entityCount !== currentCount
    || reopenedCount !== currentCount
    || input.reopened.index.summary.entityCount !== currentCount
  ) {
    fail();
  }
}

function verifyCopiedHandles(input: Parameters<typeof verifySavedOutput>[0]): void {
  const expected = [...input.expectedTemporaryIds].sort(compareText);
  const actual = Object.keys(input.writer.copiedHandleMap).sort(compareText);
  if (
    expected.length !== actual.length
    || expected.some((id, index) => id !== actual[index])
    || new Set(Object.values(input.writer.copiedHandleMap)).size !== actual.length
  ) {
    fail();
  }
  for (const id of expected) {
    const handle = input.writer.copiedHandleMap[id];
    if (
      handle === undefined
      || !/^[1-9A-F][0-9A-F]{0,15}$/u.test(handle)
      || !input.saveState.current.index.entities.some(
        (entity) => entity.id === id && entity.handle === null
      )
      || !input.reopened.index.entities.some((entity) => entity.handle === handle)
    ) {
      fail();
    }
  }
}

function verifyEntities(input: Parameters<typeof verifySavedOutput>[0]): void {
  const reopenedByHandle = new Map(
    input.reopened.index.entities
      .filter((entity) => entity.handle !== null)
      .map((entity) => [entity.handle!, entity])
  );
  const expectedNull: string[] = [];
  const reopenedMappedHandles = new Set(Object.values(input.writer.copiedHandleMap));

  for (const entity of input.saveState.current.index.entities) {
    const effectiveHandle = entity.handle ?? input.writer.copiedHandleMap[entity.id];
    if (effectiveHandle === undefined) {
      expectedNull.push(entityFingerprint(entity));
      continue;
    }
    const actual = reopenedByHandle.get(effectiveHandle);
    if (!actual || !sameEntity(entity, actual)) fail();
  }

  const actualNull = input.reopened.index.entities
    .filter((entity) => entity.handle === null)
    .map(entityFingerprint)
    .sort(compareText);
  expectedNull.sort(compareText);
  if (
    expectedNull.length !== actualNull.length
    || expectedNull.some((value, index) => value !== actualNull[index])
  ) {
    fail();
  }

  for (const handle of reopenedMappedHandles) {
    if (!reopenedByHandle.has(handle)) fail();
  }
}

function sameEntity(expected: CadEntityIndexItem, actual: CadEntityIndexItem): boolean {
  return (
    expected.type === actual.type
    && expected.layer === actual.layer
    && expected.text === actual.text
    && sameBox(expected.bbox, actual.bbox)
  );
}

function entityFingerprint(entity: CadEntityIndexItem): string {
  return JSON.stringify({
    type: entity.type,
    layer: entity.layer,
    bbox: entity.bbox,
    text: entity.text
  });
}

function verifyLayers(expected: CadEntityIndex, actual: CadEntityIndex): void {
  const actualByName = new Map(actual.layers.map((layer) => [layer.name, layer]));
  for (const layer of expected.layers) {
    const reopened = actualByName.get(layer.name);
    if (
      !reopened
      || reopened.entityCount !== layer.entityCount
      || reopened.visible !== layer.visible
      || reopened.frozen !== layer.frozen
      || (
        layer.color !== undefined
        && layer.color !== null
        && reopened.color !== layer.color
      )
      || (
        layer.locked !== undefined
        && layer.locked !== null
        && reopened.locked !== layer.locked
      )
    ) {
      fail();
    }
  }
  const expectedNames = new Set(expected.layers.map((layer) => layer.name));
  if (actual.layers.some((layer) =>
    !expectedNames.has(layer.name) && layer.entityCount !== 0
  )) {
    fail();
  }
}

function verifyWarnings(expected: CadEntityIndex, actual: CadEntityIndex): void {
  const expectedWarnings = collectWarnings(expected);
  const actualWarnings = collectWarnings(actual);
  if (
    expectedWarnings.length !== actualWarnings.length
    || expectedWarnings.some((warning, index) => warning !== actualWarnings[index])
  ) {
    fail();
  }
}

function collectWarnings(index: CadEntityIndex): string[] {
  return [
    ...index.entities.flatMap((entity) => entity.warnings),
    ...index.unsupported.flatMap((item) =>
      Array.from({ length: item.count }, () => `${item.type}:${item.reason}`)
    )
  ].sort(compareText);
}

function sameBox(
  left: CadEntityIndexItem["bbox"],
  right: CadEntityIndexItem["bbox"]
): boolean {
  if (left === null || right === null) return left === right;
  return [...left.min, ...left.max].every(
    (value, index) =>
      Math.abs(value - [...right.min, ...right.max][index]!) <= BBOX_TOLERANCE
  );
}

function sortRecord(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => compareText(left, right))
  );
}

function upperHash(value: string): string {
  return value.toUpperCase();
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(): never {
  throw new CadSaveError("CAD_SAVE_VERIFICATION_FAILED");
}
