import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  open,
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
  type CadSaveFileIdentity,
  type CadSaveFileSystem,
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
  const fileSystem = dependencies.fileSystem ?? createNodeCadSaveFileSystem();

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
      let sourceIdentity: CadSaveFileIdentity;
      try {
        canonicalSource = await fileSystem.canonicalize(source.canonicalPath);
        sourceIdentity = await fileSystem.statIdentity(canonicalSource);
        if (sourceIdentity.kind !== "file") throw new Error("not file");
      } catch {
        throw new CadSaveError("CAD_SAVE_SOURCE_MISMATCH");
      }
      if (pathKey(canonicalSource) !== pathKey(source.canonicalPath)) {
        throw new CadSaveError("CAD_SAVE_SOURCE_MISMATCH");
      }
      throwIfAborted(signal);
      const sourceHashBefore = await fileSystem.sha256(canonicalSource);
      throwIfAborted(signal);
      if (sourceHashBefore !== upperHash(source.sourceSha256)) {
        throw new CadSaveError("CAD_SAVE_SOURCE_MISMATCH");
      }

      const grant = await dependencies.grants.consume(
        request.destinationGrantId
      );
      throwIfAborted(signal);
      let canonicalDirectory: string;
      let directoryIdentity: CadSaveFileIdentity;
      try {
        canonicalDirectory = await fileSystem.canonicalize(
          grant.canonicalDirectory
        );
        directoryIdentity = await fileSystem.statIdentity(canonicalDirectory);
        if (directoryIdentity.kind !== "directory") throw new Error("not directory");
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
      if (await fileSystem.exists(finalPath)) {
        throw new CadSaveError("CAD_SAVE_OUTPUT_EXISTS");
      }

      const saveRequestId = randomUUID();
      const temporaryPath = containedSibling(
        canonicalDirectory,
        `.${stem}.${saveRequestId}.click-around.tmp.${request.format}`
      );
      if (await fileSystem.exists(temporaryPath)) {
        throw new CadSaveError("CAD_SAVE_OUTPUT_EXISTS");
      }

      let published = false;
      let temporaryHandle: Awaited<
        ReturnType<CadSaveFileSystem["openRead"]>
      > | null = null;
      let temporaryHandleClosed = false;
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
        const temporaryPathIdentity = await assertTemporaryRegularFile(
          fileSystem,
          temporaryPath,
          canonicalDirectory
        );
        throwIfAborted(signal);
        temporaryHandle = await fileSystem.openRead(temporaryPath);
        const temporaryIdentity = await temporaryHandle.identity();
        if (!sameFileIdentity(temporaryIdentity, temporaryPathIdentity)) {
          throw new CadSaveError("CAD_SAVE_VERIFICATION_FAILED");
        }
        const outputSha256 = await temporaryHandle.sha256();
        throwIfAborted(signal);

        let reopened;
        try {
          reopened = await dependencies.readDocument(temporaryPath, signal);
        } catch (error) {
          if (isAbort(error) || signal?.aborted) throw abortError();
          throw new CadSaveError("CAD_SAVE_REOPEN_FAILED");
        }
        throwIfAborted(signal);
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

        if (await fileSystem.sha256(canonicalSource) !== sourceHashBefore) {
          throw new CadSaveError("CAD_SAVE_SOURCE_MUTATED");
        }
        throwIfAborted(signal);
        await revalidateBeforePublication({
          fileSystem,
          canonicalSource,
          sourceIdentity,
          sourceHashBefore,
          canonicalDirectory,
          directoryIdentity,
          grantDirectory: grant.canonicalDirectory,
          temporaryPath,
          temporaryHandle,
          temporaryIdentity,
          outputSha256,
          signal
        });
        throwIfAborted(signal);
        try {
          await fileSystem.link(temporaryPath, finalPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new CadSaveError("CAD_SAVE_OUTPUT_EXISTS");
          }
          throw new CadSaveError("CAD_SAVE_FINALIZE_FAILED");
        }
        published = true;
        throwIfAborted(signal);
        await validatePublishedFile({
          fileSystem,
          temporaryPath,
          finalPath,
          temporaryIdentity,
          outputSha256
        });
        throwIfAborted(signal);

        try {
          await temporaryHandle.close();
          temporaryHandleClosed = true;
        } catch {
          throw new CadSaveError("CAD_SAVE_CLEANUP_FAILED");
        }

        const temporaryCleanup = await cleanupPath(fileSystem, temporaryPath);
        if (temporaryCleanup === "quarantined") {
          throw new CadSaveError("CAD_SAVE_CLEANUP_FAILED");
        }
        throwIfAborted(signal);
        verifications.set(verification.id, structuredClone(verification));
        return structuredClone(verification);
      } catch (error) {
        let cleanupFailed = false;
        if (temporaryHandle && !temporaryHandleClosed) {
          try {
            await temporaryHandle.close();
            temporaryHandleClosed = true;
          } catch {
            cleanupFailed = true;
          }
        }
        if (published) {
          try {
            await cleanupPath(fileSystem, finalPath);
            published = false;
          } catch {
            cleanupFailed = true;
          }
        }
        try {
          await cleanupPath(fileSystem, temporaryPath);
        } catch {
          cleanupFailed = true;
        }
        if (cleanupFailed) {
          throw new CadSaveError("CAD_SAVE_CLEANUP_FAILED");
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

export type { CadSaveFileSystem } from "./contracts.js";

export function createNodeCadSaveFileSystem(): CadSaveFileSystem {
  return {
    canonicalize: realpath,
    async statIdentity(path) {
      return fileIdentity(await stat(path, { bigint: true }));
    },
    async lstatIdentity(path) {
      return fileIdentity(await lstat(path, { bigint: true }));
    },
    async openRead(path) {
      const handle = await open(path, "r");
      return {
        async identity() {
          return fileIdentity(await handle.stat({ bigint: true }));
        },
        async sha256() {
          return hashBytes(await handle.readFile());
        },
        async close() {
          await handle.close();
        }
      };
    },
    async sha256(path) {
      return hashBytes(await readFile(path));
    },
    async exists(path) {
      try {
        await lstat(path);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    },
    link,
    async remove(path) {
      await rm(path);
    },
    move: rename
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
  fileSystem: CadSaveFileSystem,
  path: string,
  directory: string
): Promise<CadSaveFileIdentity> {
  try {
    const identity = await fileSystem.lstatIdentity(path);
    if (identity.kind !== "file" || identity.symbolicLink) {
      throw new Error("unsafe output");
    }
    if (
      pathKey(dirname(await fileSystem.canonicalize(path))) !== pathKey(directory)
    ) {
      throw new Error("escaped output");
    }
    return identity;
  } catch {
    throw new CadSaveError("CAD_SAVE_VERIFICATION_FAILED");
  }
}

async function revalidateBeforePublication(input: {
  fileSystem: CadSaveFileSystem;
  canonicalSource: string;
  sourceIdentity: CadSaveFileIdentity;
  sourceHashBefore: string;
  canonicalDirectory: string;
  directoryIdentity: CadSaveFileIdentity;
  grantDirectory: string;
  temporaryPath: string;
  temporaryHandle: Awaited<ReturnType<CadSaveFileSystem["openRead"]>>;
  temporaryIdentity: CadSaveFileIdentity;
  outputSha256: string;
  signal?: AbortSignal;
}): Promise<void> {
  throwIfAborted(input.signal);
  let currentDirectory: string;
  let currentDirectoryIdentity: CadSaveFileIdentity;
  try {
    currentDirectory = await input.fileSystem.canonicalize(input.grantDirectory);
    currentDirectoryIdentity = await input.fileSystem.statIdentity(
      currentDirectory
    );
  } catch {
    throw new CadSaveError("CAD_SAVE_DESTINATION_INVALID");
  }
  throwIfAborted(input.signal);
  if (
    pathKey(currentDirectory) !== pathKey(input.canonicalDirectory)
    || !sameObjectIdentity(currentDirectoryIdentity, input.directoryIdentity)
  ) {
    throw new CadSaveError("CAD_SAVE_DESTINATION_INVALID");
  }

  const handleIdentity = await input.temporaryHandle.identity();
  throwIfAborted(input.signal);
  let pathIdentity: CadSaveFileIdentity;
  try {
    pathIdentity = await input.fileSystem.lstatIdentity(input.temporaryPath);
  } catch {
    throw new CadSaveError("CAD_SAVE_VERIFICATION_FAILED");
  }
  if (
    !sameFileIdentity(handleIdentity, input.temporaryIdentity)
    || !sameFileIdentity(pathIdentity, input.temporaryIdentity)
    || pathIdentity.kind !== "file"
    || pathIdentity.symbolicLink
  ) {
    throw new CadSaveError("CAD_SAVE_VERIFICATION_FAILED");
  }
  const canonicalTemporary = await input.fileSystem.canonicalize(
    input.temporaryPath
  );
  throwIfAborted(input.signal);
  if (pathKey(dirname(canonicalTemporary)) !== pathKey(input.canonicalDirectory)) {
    throw new CadSaveError("CAD_SAVE_VERIFICATION_FAILED");
  }
  if (
    await input.fileSystem.sha256(input.temporaryPath) !== input.outputSha256
  ) {
    throw new CadSaveError("CAD_SAVE_VERIFICATION_FAILED");
  }
  throwIfAborted(input.signal);

  let currentSourceIdentity: CadSaveFileIdentity;
  try {
    currentSourceIdentity = await input.fileSystem.statIdentity(
      input.canonicalSource
    );
  } catch {
    throw new CadSaveError("CAD_SAVE_SOURCE_MUTATED");
  }
  if (
    !sameFileIdentity(currentSourceIdentity, input.sourceIdentity)
    || await input.fileSystem.sha256(input.canonicalSource)
      !== input.sourceHashBefore
  ) {
    throw new CadSaveError("CAD_SAVE_SOURCE_MUTATED");
  }
  throwIfAborted(input.signal);
}

async function validatePublishedFile(input: {
  fileSystem: CadSaveFileSystem;
  temporaryPath: string;
  finalPath: string;
  temporaryIdentity: CadSaveFileIdentity;
  outputSha256: string;
}): Promise<void> {
  try {
    const finalIdentity = await input.fileSystem.lstatIdentity(input.finalPath);
    const temporaryIdentity = await input.fileSystem.lstatIdentity(
      input.temporaryPath
    );
    if (
      finalIdentity.kind !== "file"
      || finalIdentity.symbolicLink
      || !sameFileIdentity(finalIdentity, input.temporaryIdentity)
      || !sameFileIdentity(temporaryIdentity, input.temporaryIdentity)
      || await input.fileSystem.sha256(input.finalPath) !== input.outputSha256
    ) {
      throw new Error("published output changed");
    }
  } catch {
    throw new CadSaveError("CAD_SAVE_VERIFICATION_FAILED");
  }
}

async function cleanupPath(
  fileSystem: CadSaveFileSystem,
  path: string
): Promise<"absent" | "removed" | "quarantined"> {
  let exists: boolean;
  try {
    exists = await fileSystem.exists(path);
  } catch {
    throw new CadSaveError("CAD_SAVE_CLEANUP_FAILED");
  }
  if (!exists) return "absent";
  try {
    await fileSystem.remove(path);
    return "removed";
  } catch {
    const quarantine = join(
      dirname(path),
      `.${basename(path)}.failed.${randomUUID()}`
    );
    try {
      await fileSystem.move(path, quarantine);
      return "quarantined";
    } catch {
      throw new CadSaveError("CAD_SAVE_CLEANUP_FAILED");
    }
  }
}

function temporaryIds(lineage: readonly CadIoWriteTransaction[]): string[] {
  return lineage.flatMap((transaction) =>
    transaction.commands.flatMap((command) =>
      command.kind === "entity.copy" ? command.temporaryIds : []
    )
  );
}

function fileIdentity(metadata: {
  dev: bigint;
  ino: bigint;
  size: bigint;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): CadSaveFileIdentity {
  return {
    dev: metadata.dev.toString(),
    ino: metadata.ino.toString(),
    size: metadata.size.toString(),
    kind: metadata.isFile()
      ? "file"
      : metadata.isDirectory()
        ? "directory"
        : "other",
    symbolicLink: metadata.isSymbolicLink()
  };
}

function sameObjectIdentity(
  left: CadSaveFileIdentity,
  right: CadSaveFileIdentity
): boolean {
  return (
    left.dev === right.dev
    && left.ino === right.ino
    && left.kind === right.kind
    && left.symbolicLink === right.symbolicLink
  );
}

function sameFileIdentity(
  left: CadSaveFileIdentity,
  right: CadSaveFileIdentity
): boolean {
  return sameObjectIdentity(left, right) && left.size === right.size;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
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
