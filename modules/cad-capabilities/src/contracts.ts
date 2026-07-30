import type {
  CadEntityIndex,
  CadOutputVerification
} from "@dwg/contracts";
import type { CadIoClient } from "@dwg/cad-io-acadsharp";
import type { CadCommittedTransactionStore } from "@dwg/cad-edit";

export type CadCapabilityName =
  | "document.open"
  | "document.describe"
  | "query.layers"
  | "query.entities"
  | "query.text"
  | "query.schedule"
  | "query.compare"
  | "edit.preview"
  | "edit.apply"
  | "edit.undo"
  | "edit.redo"
  | "export.report"
  | "export.drawing"
  | "verification.get";

export interface CadCapabilityRuntime {
  execute(
    name: CadCapabilityName,
    input: unknown,
    signal?: AbortSignal
  ): Promise<unknown>;
}

export interface CadCapabilityModule {
  names: readonly CadCapabilityName[];
  execute(
    name: CadCapabilityName,
    input: unknown,
    signal?: AbortSignal
  ): Promise<unknown>;
}

export interface ReadCapabilityDependencies {
  open(path: string, signal?: AbortSignal): Promise<CadEntityIndex>;
  get(drawingId: string): CadEntityIndex | null;
}

export interface OutputDestinationGrant {
  id: string;
  canonicalDirectory: string;
  expiresAt: number;
  used: boolean;
}

export interface DestinationGrantProvider {
  consume(id: string): Promise<OutputDestinationGrant>;
}

export interface DestinationGrantStore extends DestinationGrantProvider {
  issue(canonicalDirectory: string, expiresAt: number): Promise<string>;
}

export interface CadSourceDocument {
  documentId: string;
  canonicalPath: string;
  sourceSha256: string;
  drawingVersion: string | null;
  units: string | null;
}

export interface CadSourceDocumentResolver {
  resolve(documentId: string, signal?: AbortSignal): Promise<CadSourceDocument>;
}

export interface CadParsedDocumentEvidence {
  index: CadEntityIndex;
  sourceSha256: string;
  drawingVersion: string | null;
  units: string | null;
}

export interface CadSaveDependencies {
  cadIo: CadIoClient;
  sources: CadSourceDocumentResolver;
  readDocument(
    path: string,
    signal?: AbortSignal
  ): Promise<CadParsedDocumentEvidence>;
  transactions: CadCommittedTransactionStore;
  grants: DestinationGrantProvider;
}

export interface CadSaveInput {
  documentId: string;
  expectedRevision: number;
  destinationGrantId: string;
  baseFilename: string;
  format: "dxf" | "dwg";
  version: string;
}

export interface CadSaveCoordinator {
  saveCopy(
    input: CadSaveInput,
    signal?: AbortSignal
  ): Promise<CadOutputVerification>;
  getVerification(id: string): CadOutputVerification | null;
}

export type CadSaveErrorCode =
  | "DESTINATION_GRANT_UNKNOWN"
  | "DESTINATION_GRANT_EXPIRED"
  | "DESTINATION_GRANT_REUSED"
  | "DESTINATION_GRANT_INVALID"
  | "CAD_SAVE_INPUT_INVALID"
  | "CAD_SAVE_STALE"
  | "CAD_SAVE_LINEAGE_INVALID"
  | "CAD_SAVE_LINEAGE_LIMIT"
  | "CAD_SAVE_SOURCE_MISMATCH"
  | "CAD_SAVE_SOURCE_MUTATED"
  | "CAD_SAVE_DESTINATION_INVALID"
  | "CAD_SAVE_SOURCE_OUTPUT_EQUAL"
  | "CAD_SAVE_OUTPUT_EXISTS"
  | "CAD_SAVE_WRITE_FAILED"
  | "CAD_SAVE_REOPEN_FAILED"
  | "CAD_SAVE_VERIFICATION_FAILED"
  | "CAD_SAVE_FINALIZE_FAILED";

export class CadSaveError extends Error {
  constructor(
    readonly code: CadSaveErrorCode,
    message = "CAD save operation failed."
  ) {
    super(message);
    this.name = "CadSaveError";
  }
}
