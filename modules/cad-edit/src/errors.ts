export type CadEditErrorCode =
  | "EDIT_DOCUMENT_MISMATCH"
  | "EDIT_REVISION_CONFLICT"
  | "EDIT_PRECONDITION_FAILED"
  | "EDIT_DUPLICATE_TARGET"
  | "EDIT_TARGET_NOT_FOUND"
  | "EDIT_UNSUPPORTED_ENTITY"
  | "EDIT_LAYER_EXISTS"
  | "EDIT_REVISION_LIMIT";

export class CadEditError extends Error {
  readonly code: CadEditErrorCode;

  constructor(code: CadEditErrorCode, message: string) {
    super(message);
    this.name = "CadEditError";
    this.code = code;
  }
}
