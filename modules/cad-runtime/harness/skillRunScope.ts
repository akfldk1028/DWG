import type { CadCapabilityRuntime } from "@dwg/cad-capabilities";
import { MAX_SKILL_RELATED_DOCUMENT_IDS } from "@dwg/contracts";

export interface CliDocumentScope {
  documentId: string;
  relatedDocumentIds: string[];
}

export async function resolveCliDocumentScope(
  input: unknown,
  declaredDocumentId: string | undefined,
  declaredRelatedDocumentIds: readonly string[],
  capabilities: CadCapabilityRuntime
): Promise<CliDocumentScope> {
  assertDeclaredRelated(declaredRelatedDocumentIds);
  if (isRecord(input) && ("beforeDrawingId" in input || "afterDrawingId" in input)) {
    const before = input.beforeDrawingId;
    const after = input.afterDrawingId;
    if (!validDocumentId(before) || !validDocumentId(after)) {
      throw new Error("DOCUMENT_SCOPE_AMBIGUOUS");
    }
    const inferredRelated = before === after ? [] : [after];
    if (
      declaredDocumentId !== undefined && declaredDocumentId !== before ||
      declaredRelatedDocumentIds.length > 0 &&
        !sameArray(declaredRelatedDocumentIds, inferredRelated)
    ) throw new Error("DOCUMENT_SCOPE_AMBIGUOUS");
    return { documentId: before, relatedDocumentIds: inferredRelated };
  }

  let documentId = declaredDocumentId;
  if (documentId === undefined && isRecord(input)) {
    if (validDocumentId(input.documentId)) {
      documentId = input.documentId;
    } else if (typeof input.path === "string") {
      const opened = await capabilities.execute("document.open", {
        path: input.path
      }) as { drawingId?: unknown };
      if (validDocumentId(opened.drawingId)) documentId = opened.drawingId;
    }
  }
  if (!validDocumentId(documentId) || declaredRelatedDocumentIds.includes(documentId)) {
    throw new Error("DOCUMENT_SCOPE_REQUIRED");
  }
  return {
    documentId,
    relatedDocumentIds: [...declaredRelatedDocumentIds]
  };
}

function assertDeclaredRelated(values: readonly string[]): void {
  if (
    values.length > MAX_SKILL_RELATED_DOCUMENT_IDS ||
    !values.every(validDocumentId) ||
    new Set(values).size !== values.length
  ) throw new Error("DOCUMENT_SCOPE_INVALID");
}

function validDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 256 &&
    /^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
