import {
  MAX_CAD_DRAWING_COMPARISON_ENTRIES,
  isCadDrawingComparison,
  isCadEntityIndex,
  type CadChangedField,
  type CadDrawingChange,
  type CadDrawingComparison,
  type CadEntityIndex,
  type CadEntityIndexItem,
  type CadEntityMatch,
  type CadPointBox
} from "@dwg/contracts";

const BBOX_TOLERANCE = 0.000001;

export function compareCadDrawings(
  before: CadEntityIndex,
  after: CadEntityIndex
): CadDrawingComparison {
  assertCadIndex(before);
  assertCadIndex(after);

  const unmatchedBefore = new Set(before.entities);
  const unmatchedAfter = new Set(after.entities);
  const matched: Array<[CadEntityIndexItem, CadEntityIndexItem]> = [];

  for (const beforeEntity of sortedEntities(before.entities)) {
    if (beforeEntity.handle === null) continue;
    const afterEntity = sortedEntities([...unmatchedAfter]).find(
      (candidate) => candidate.handle === beforeEntity.handle
    );
    if (afterEntity) {
      matched.push([beforeEntity, afterEntity]);
      unmatchedBefore.delete(beforeEntity);
      unmatchedAfter.delete(afterEntity);
    }
  }

  for (const beforeEntity of sortedEntities([...unmatchedBefore])) {
    const afterEntity = sortedEntities([...unmatchedAfter]).find(
      (candidate) => candidate.id === beforeEntity.id
    );
    if (afterEntity) {
      matched.push([beforeEntity, afterEntity]);
      unmatchedBefore.delete(beforeEntity);
      unmatchedAfter.delete(afterEntity);
    }
  }

  const comparison: CadDrawingComparison = {
    added: sortedEntities([...unmatchedAfter]).map(toMatch),
    removed: sortedEntities([...unmatchedBefore]).map(toMatch),
    changed: matched
      .map(([beforeEntity, afterEntity]) => toChange(beforeEntity, afterEntity))
      .filter((change): change is CadDrawingChange => change !== null)
      .sort((left, right) => compareEntitiesByEvidence(left.before, right.before))
  };
  const entryCount = comparison.added.length + comparison.removed.length + comparison.changed.length;
  if (entryCount > MAX_CAD_DRAWING_COMPARISON_ENTRIES) {
    throw new RangeError("CAD drawing comparison exceeds the maximum entry count.");
  }
  if (!isCadDrawingComparison(comparison)) {
    throw new Error("CAD drawing comparison output violates its public contract.");
  }
  return comparison;
}

function toChange(
  before: CadEntityIndexItem,
  after: CadEntityIndexItem
): CadDrawingChange | null {
  const fields: CadChangedField[] = [];
  if (before.type !== after.type) fields.push("type");
  if (before.layer !== after.layer) fields.push("layer");
  if (!sameBox(before.bbox, after.bbox)) fields.push("bbox");
  if (before.text !== after.text) fields.push("text");
  return fields.length === 0
    ? null
    : { before: toMatch(before), after: toMatch(after), fields };
}

function toMatch(entity: CadEntityIndexItem): CadEntityMatch {
  return {
    id: entity.id,
    handle: entity.handle,
    type: entity.type,
    layer: entity.layer,
    bbox: entity.bbox === null ? null : structuredClone(entity.bbox),
    text: entity.text,
    reason: "matched drawing evidence",
    confidence: entity.bbox === null ? 0.5 : 1
  };
}

function sameBox(left: CadPointBox | null, right: CadPointBox | null): boolean {
  if (left === null || right === null) return left === right;
  return left.min.every((coordinate, index) =>
    Math.abs(coordinate - right.min[index]!) <= BBOX_TOLERANCE
  ) && left.max.every((coordinate, index) =>
    Math.abs(coordinate - right.max[index]!) <= BBOX_TOLERANCE
  );
}

function sortedEntities(entities: readonly CadEntityIndexItem[]): CadEntityIndexItem[] {
  return [...entities].sort(compareEntitiesByEvidence);
}

function compareEntitiesByEvidence(
  left: Pick<CadEntityIndexItem, "handle" | "id">,
  right: Pick<CadEntityIndexItem, "handle" | "id">
): number {
  return (left.handle ?? left.id).localeCompare(right.handle ?? right.id) ||
    left.id.localeCompare(right.id);
}

function assertCadIndex(value: unknown): asserts value is CadEntityIndex {
  if (!isCadEntityIndex(value)) {
    throw new TypeError("CAD drawing comparison requires valid CAD entity indexes.");
  }
}
