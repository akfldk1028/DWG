import {
  parseCadEditBatch,
  type CadChange,
  type CadCommandProposal,
  type CadEditBatch,
  type CadEditPrecondition,
  type CadResolvedCommand
} from "@dwg/contracts";
import { cloneDocumentSnapshot, type CadDocumentSnapshot } from "@dwg/cad-document";
import { applyCommand } from "./commandHandlers.js";
import { CadEditError } from "./errors.js";

export interface CadEditPreview {
  transactionId: string;
  baseRevision: number;
  nextRevision: number;
  changes: CadChange[];
  resolvedCommands: CadResolvedCommand[];
  warnings: string[];
  snapshot: CadDocumentSnapshot;
}

export function previewEditBatch(snapshot: CadDocumentSnapshot, input: CadEditBatch): CadEditPreview {
  const batch = parseCadEditBatch(input);
  validateBatch(snapshot, batch);
  const nextRevision = snapshot.revision + 1;
  if (!Number.isSafeInteger(nextRevision)) {
    throw new CadEditError("EDIT_REVISION_LIMIT", "Next document revision exceeds the safe integer range.");
  }

  const preview = cloneDocumentSnapshot(snapshot);
  const changes: CadChange[] = [];
  const resolvedCommands: CadResolvedCommand[] = [];
  for (const proposal of batch.commands) {
    const application = applyCommand(preview, proposal, batch.transactionId);
    changes.push(...application.changes);
    resolvedCommands.push(application.resolved);
  }
  preview.revision = nextRevision;
  return {
    transactionId: batch.transactionId,
    baseRevision: snapshot.revision,
    nextRevision,
    changes,
    resolvedCommands,
    warnings: [],
    snapshot: preview
  };
}

function validateBatch(snapshot: CadDocumentSnapshot, batch: CadEditBatch): void {
  if (batch.documentId !== snapshot.documentId) {
    throw new CadEditError("EDIT_DOCUMENT_MISMATCH", "Edit batch document does not match the snapshot.");
  }
  if (batch.expectedRevision !== snapshot.revision) {
    throw new CadEditError("EDIT_REVISION_CONFLICT", "Edit batch revision does not match the snapshot.");
  }
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
    throw new CadEditError("EDIT_REVISION_CONFLICT", "Snapshot revision is not a safe non-negative integer.");
  }

  const targets = new Set<string>();
  const commandIds = new Set<string>();
  for (const proposal of batch.commands) {
    if (proposal.expectedRevision !== batch.expectedRevision) {
      throw new CadEditError("EDIT_REVISION_CONFLICT", "Command revision does not match the edit batch.");
    }
    if (commandIds.has(proposal.commandId)) {
      throw new CadEditError("EDIT_DUPLICATE_TARGET", `Duplicate command ID: ${proposal.commandId}`);
    }
    commandIds.add(proposal.commandId);
    for (const target of commandTargets(proposal)) {
      if (targets.has(target)) {
        throw new CadEditError("EDIT_DUPLICATE_TARGET", `Duplicate edit target: ${target}`);
      }
      targets.add(target);
    }
    for (const precondition of proposal.preconditions) validatePrecondition(snapshot, precondition);
  }
}

function commandTargets(proposal: CadCommandProposal): string[] {
  switch (proposal.operation.kind) {
    case "layer.create":
    case "layer.update":
      return [proposal.operation.layerId];
    case "text.replace":
      return [proposal.operation.handle];
    case "entity.move":
    case "entity.copy":
    case "entity.delete":
      return proposal.operation.handles;
  }
}

function validatePrecondition(snapshot: CadDocumentSnapshot, precondition: CadEditPrecondition): void {
  const entity = snapshot.index.entities.find((candidate) => candidate.handle === precondition.target);
  const layer = snapshot.layers.find((candidate) => candidate.id === precondition.target);
  const exists = entity !== undefined || layer !== undefined;
  if (precondition.field === "exists") {
    if (exists !== precondition.equals) failPrecondition(precondition);
    return;
  }
  if (!entity) failPrecondition(precondition);
  if (precondition.field === "type" && entity.type !== precondition.equals) failPrecondition(precondition);
  if (precondition.field === "layer" && entity.layer !== precondition.equals) failPrecondition(precondition);
  if (precondition.field === "text" && entity.text !== precondition.equals) failPrecondition(precondition);
}

function failPrecondition(precondition: CadEditPrecondition): never {
  throw new CadEditError(
    "EDIT_PRECONDITION_FAILED",
    `Precondition failed for ${precondition.target}: ${precondition.field}`
  );
}
