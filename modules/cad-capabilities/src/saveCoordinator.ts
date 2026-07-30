import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  readFile,
  realpath,
  rename,
  rm,
  stat
} from "node:fs/promises";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";

import {
  mapCadSaveLineage,
  type CadIoWriteTransaction
} from "@dwg/cad-io-acadsharp";
import type {
  CadCommittedTransaction,
  CadSaveState
} from "@dwg/cad-edit";
import type { CadOutputVerification } from "@dwg/contracts";

import {
  CadSaveError,
  type CadSaveCoordinator,
  type CadSaveDependencies,
  type CadSaveInput
} from "./contracts.js";
import { verifySavedOutput } from "./outputVerification.js";

const MAX_LINEAGE_COMMANDS = 10_000;
const MAX_LINEAGE_TRANSACTIONS = 10_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERSION_PATTERN = /^AC[0-9]{4}$/u;

export function createSaveCoordinator(
  dependencies: CadSaveDependencies
): CadSaveCoordinator {
  const verifications = new Map<string, CadOutputVerification>();

  return {
    async saveCopy(input, signal) {
      const request = parseInput(input);
      throwIfAborted(signal);
      const saveState = dependencies.transactions.getSaveState(
        request.documentId,
        request.expectedRevision
      );
      if (!saveState) throw new CadSaveError("CAD_SAVE_STALE");
      validateSaveState(saveState, request);
      throwIfAborted(signal);

      const source = await dependencies.sources.resolve(
        saveState.documentId,
        signal
      );
      throwIfAborted(signal);
      if (
        source.documentId !== saveState.documentId
        || upperHash(source.sourceSha256) !== upperHash(saveState.source.sourceSha256)
        || source.drawingVersion !== saveState.source.drawingVersion
        || source.units !== saveState.source.units
      ) {
        throw new CadSaveError("CAD_SAVE_SOURCE_MISMATCH");
      }

      let canonicalSource: string;
      try {
        canonicalSource = await realpath(source.canonicalPath);
        if (!(await stat(canonicalSource)).isFile()) throw new Error("not file");
      } catch {
        throw new CadSaveError("CAD_SAVE_SOURCE_MISMATCH");
      }
      if (pathKey(canonicalSource) !== pathKey(source.canonicalPath)) {
        throw new CadSaveError("CAD_SAVE_SOURCE_MISMATCH");
      }
      const sourceHashBefore = await shaFile(canonicalSource);
      if (sourceHashBefore !== upperHash(source.sourceSha256)) {
        throw new CadSaveError("CAD_SAVE_SOURCE_MISMATCH");
      }

      const grant = await dependencies.grants.consume(
        request.destinationGrantId
      );
      throwIfAborted(signal);
      let canonicalDirectory: string;
      try {
        canonicalDirectory = await realpath(grant.canonicalDirectory);
        if (!(await stat(canonicalDirectory)).isDirectory()) throw new Error("not directory");
      } catch {
        throw new CadSaveError("CAD_SAVE_DESTINATION_INVALID");
      }
      if (pathKey(canonicalDirectory) !== pathKey(grant.canonicalDirectory)) {
        throw new CadSaveError("CAD_SAVE_DESTINATION_INVALID");
      }

      const stem = safeStem(request.baseFilename, request.format);
      const finalPath = containedSibling(
        canonicalDirectory,
        `${stem}.${request.format}`
      );
      if (pathKey(finalPath) === pathKey(canonicalSource)) {
        throw new CadSaveError("CAD_SAVE_SOURCE_OUTPUT_EQUAL");
      }
      if (await pathExists(finalPath)) {
        throw new CadSaveError("CAD_SAVE_OUTPUT_EXISTS");
      }

      const saveRequestId = randomUUID();
      const temporaryPath = containedSibling(
        canonicalDirectory,
        `.${stem}.${saveRequestId}.click-around.tmp.${request.format}`
      );
      if (await pathExists(temporaryPath)) {
        throw new CadSaveError("CAD_SAVE_OUTPUT_EXISTS");
      }

      let finalized = false;
      try {
        const lineage = writerLineage(saveState);
        let writer;
        try {
          writer = await dependencies.cadIo.writeCopy({
            sourcePath: canonicalSource,
            temporaryOutputPath: temporaryPath,
            format: request.format,
            version: request.version,
            lineage
          }, signal);
        } catch (error) {
          if (isAbort(error) || signal?.aborted) throw abortError();
          throw new CadSaveError("CAD_SAVE_WRITE_FAILED");
        }
        throwIfAborted(signal);
        assertTemporaryRegularFile(temporaryPath, canonicalDirectory);

        let reopened;
        try {
          reopened = await dependencies.readDocument(temporaryPath, signal);
        } catch (error) {
          if (isAbort(error) || signal?.aborted) throw abortError();
          throw new CadSaveError("CAD_SAVE_REOPEN_FAILED");
        }
        throwIfAborted(signal);
        const outputSha256 = await shaFile(temporaryPath);
        const verification = verifySavedOutput({
          verificationId: saveRequestId,
          format: request.format,
          requestedVersion: request.version,
          outputSha256,
          saveState,
          writer,
          reopened,
          expectedTemporaryIds: temporaryIds(lineage)
        });

        if (await shaFile(canonicalSource) !== sourceHashBefore) {
          throw new CadSaveError("CAD_SAVE_SOURCE_MUTATED");
        }
        if (await pathExists(finalPath)) {
          throw new CadSaveError("CAD_SAVE_OUTPUT_EXISTS");
        }
        try {
          await rename(temporaryPath, finalPath);
        } catch {
          throw new CadSaveError("CAD_SAVE_FINALIZE_FAILED");
        }
        finalized = true;
        if (await shaFile(canonicalSource) !== sourceHashBefore) {
          throw new CadSaveError("CAD_SAVE_SOURCE_MUTATED");
        }
        verifications.set(verification.id, structuredClone(verification));
        return structuredClone(verification);
      } catch (error) {
        if (!finalized) await removeOrQuarantine(temporaryPath);
        if (
          await safeShaFile(canonicalSource) !== sourceHashBefore
          && !(error instanceof CadSaveError && error.code === "CAD_SAVE_SOURCE_MUTATED")
        ) {
          throw new CadSaveError("CAD_SAVE_SOURCE_MUTATED");
        }
        throw error;
      }
    },

    getVerification(id) {
      const verification = verifications.get(id);
      return verification ? structuredClone(verification) : null;
    }
  };
}

function parseInput(input: CadSaveInput): CadSaveInput {
  if (
    !isPlainObject(input)
    || !hasExactKeys(input, [
      "documentId",
      "expectedRevision",
      "destinationGrantId",
      "baseFilename",
      "format",
      "version"
    ])
    || typeof input.documentId !== "string"
    || input.documentId.length < 1
    || input.documentId.length > 512
    || !Number.isSafeInteger(input.expectedRevision)
    || input.expectedRevision < 0
    || typeof input.destinationGrantId !== "string"
    || !UUID_PATTERN.test(input.destinationGrantId)
    || typeof input.baseFilename !== "string"
    || input.baseFilename.length < 1
    || input.baseFilename.length > 255
    || (input.format !== "dxf" && input.format !== "dwg")
    || typeof input.version !== "string"
    || !VERSION_PATTERN.test(input.version)
  ) {
    throw new CadSaveError("CAD_SAVE_INPUT_INVALID");
  }
  return { ...input };
}

function validateSaveState(
  state: CadSaveState,
  request: CadSaveInput
): void {
  if (
    state.documentId !== request.documentId
    || state.revision !== request.expectedRevision
    || state.source.documentId !== request.documentId
    || state.current.documentId !== request.documentId
    || state.source.revision !== 0
    || state.current.revision !== state.revision
    || !Array.isArray(state.lineage)
  ) {
    throw new CadSaveError("CAD_SAVE_LINEAGE_INVALID");
  }
  if (state.lineage.length > MAX_LINEAGE_TRANSACTIONS) {
    throw new CadSaveError("CAD_SAVE_LINEAGE_LIMIT");
  }
  let commands = 0;
  let predecessor = state.source;
  const transactionIds = new Set<string>();
  for (const transaction of state.lineage) {
    if (
      transaction.status !== "applied"
      || transaction.batch.documentId !== state.documentId
      || transactionIds.has(transaction.batch.transactionId)
      || !Array.isArray(transaction.batch.commands)
      || transaction.batch.commands.length === 0
      || !sameContent(predecessor, transaction.before)
    ) {
      throw new CadSaveError("CAD_SAVE_LINEAGE_INVALID");
    }
    transactionIds.add(transaction.batch.transactionId);
    commands += transaction.batch.commands.length;
    if (commands > MAX_LINEAGE_COMMANDS) {
      throw new CadSaveError("CAD_SAVE_LINEAGE_LIMIT");
    }
    predecessor = transaction.after;
  }
  if (!sameContent(predecessor, state.current)) {
    throw new CadSaveError("CAD_SAVE_LINEAGE_INVALID");
  }
}

function writerLineage(state: CadSaveState): CadIoWriteTransaction[] {
  const normalized: CadCommittedTransaction[] = state.lineage.map(
    (transaction, index) => ({
      ...structuredClone(transaction),
      before: { ...structuredClone(transaction.before), revision: index },
      after: { ...structuredClone(transaction.after), revision: index + 1 }
    })
  );
  try {
    return mapCadSaveLineage(normalized);
  } catch {
    throw new CadSaveError("CAD_SAVE_LINEAGE_INVALID");
  }
}

function sameContent(
  left: CadSaveState["source"],
  right: CadSaveState["source"]
): boolean {
  const normalizedLeft = structuredClone(left);
  const normalizedRight = structuredClone(right);
  normalizedLeft.revision = 0;
  normalizedRight.revision = 0;
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function safeStem(value: string, format: "dxf" | "dwg"): string {
  const normalizedValue = value.normalize("NFKC");
  if (
    normalizedValue !== basename(normalizedValue)
    || /[\\/:\u0000-\u001f]/u.test(normalizedValue)
    || normalizedValue === "."
    || normalizedValue === ".."
  ) {
    throw new CadSaveError("CAD_SAVE_DESTINATION_INVALID");
  }
  const withoutExtension = extname(normalizedValue).toLowerCase() === `.${format}`
    ? normalizedValue.slice(0, -1 * (format.length + 1))
    : normalizedValue;
  const stem = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/gu, "-")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "-")
    .replace(/[ .]+$/u, "")
    .replace(/^[-. ]+|[-. ]+$/gu, "")
    .slice(0, 120);
  if (
    stem.length === 0
    || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(stem)
  ) {
    throw new CadSaveError("CAD_SAVE_DESTINATION_INVALID");
  }
  return stem;
}

function containedSibling(directory: string, filename: string): string {
  const path = resolve(directory, filename);
  if (
    pathKey(dirname(path)) !== pathKey(directory)
    || basename(path) !== filename
  ) {
    throw new CadSaveError("CAD_SAVE_DESTINATION_INVALID");
  }
  return path;
}

async function assertTemporaryRegularFile(
  path: string,
  directory: string
): Promise<void> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("unsafe output");
    if (pathKey(dirname(await realpath(path))) !== pathKey(directory)) {
      throw new Error("escaped output");
    }
  } catch {
    throw new CadSaveError("CAD_SAVE_VERIFICATION_FAILED");
  }
}

async function removeOrQuarantine(path: string): Promise<void> {
  if (!(await pathExists(path))) return;
  try {
    await rm(path, { force: true });
    return;
  } catch {
    // A locked Windows file may need to remain as a visibly failed sibling.
  }
  const quarantine = join(
    dirname(path),
    `.${basename(path)}.failed.${randomUUID()}`
  );
  try {
    await rename(path, quarantine);
  } catch {
    // Never touch the intended final path while cleanup is blocked.
  }
}

function temporaryIds(lineage: readonly CadIoWriteTransaction[]): string[] {
  return lineage.flatMap((transaction) =>
    transaction.commands.flatMap((command) =>
      command.kind === "entity.copy" ? command.temporaryIds : []
    )
  );
}

async function shaFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex").toUpperCase();
}

async function safeShaFile(path: string): Promise<string | null> {
  try {
    return await shaFile(path);
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new CadSaveError("CAD_SAVE_DESTINATION_INVALID");
  }
}

function pathKey(path: string): string {
  return normalize(resolve(path)).replaceAll("\\", "/").toLowerCase();
}

function upperHash(value: string): string {
  return value.toUpperCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length
    && keys.every((key, index) => key === sortedExpected[index]);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
