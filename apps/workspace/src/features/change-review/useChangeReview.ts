import { useCallback, useEffect, useRef, useState } from "react";

import type { CadEditBatch, CadEditPreviewResponse } from "@dwg/contracts";

import {
  EditClientError,
  applyEdit,
  previewEdit,
  redoEdit,
  undoEdit
} from "../../shared/api/editClient";

export type ChangeReviewPhase =
  | "idle"
  | "previewing"
  | "ready"
  | "applying"
  | "applied"
  | "rejected"
  | "undoing"
  | "undone"
  | "redoing"
  | "redone"
  | "stale"
  | "error";

export type ChangeReviewRetry = "preview" | "apply" | "undo" | "redo" | null;

interface ChangeReviewState {
  phase: ChangeReviewPhase;
  preview: CadEditPreviewResponse | null;
  revision: number | null;
  error: string | null;
  retryAction: ChangeReviewRetry;
}

const initialState: ChangeReviewState = {
  phase: "idle",
  preview: null,
  revision: null,
  error: null,
  retryAction: null
};

export function useChangeReview(pendingBatch: CadEditBatch | null) {
  const [state, setState] = useState<ChangeReviewState>(initialState);
  const activeController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const batchRef = useRef<CadEditBatch | null>(null);

  const begin = useCallback(() => {
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    busy.current = true;
    return { controller, generation: ++generation.current };
  }, []);

  const complete = useCallback((operation: { controller: AbortController; generation: number }) => {
    if (generation.current !== operation.generation || activeController.current !== operation.controller) return false;
    activeController.current = null;
    busy.current = false;
    return true;
  }, []);

  const preview = useCallback(async (batch: CadEditBatch) => {
    batchRef.current = batch;
    const operation = begin();
    setState({ phase: "previewing", preview: null, revision: null, error: null, retryAction: null });
    try {
      const response = await previewEdit(batch, operation.controller.signal);
      if (!complete(operation)) return;
      setState({ phase: "ready", preview: response, revision: response.baseRevision, error: null, retryAction: null });
    } catch (reason) {
      if (operation.controller.signal.aborted || !complete(operation)) return;
      setState({
        phase: "error",
        preview: null,
        revision: null,
        error: messageFor(reason),
        retryAction: "preview"
      });
    }
  }, [begin, complete]);

  useEffect(() => {
    if (pendingBatch) void preview(pendingBatch);
  }, [pendingBatch, preview]);

  useEffect(() => () => {
    generation.current += 1;
    activeController.current?.abort();
    activeController.current = null;
  }, []);

  const approve = useCallback(async () => {
    if (
      busy.current ||
      !state.preview ||
      (state.phase !== "ready" && state.retryAction !== "apply")
    ) return;
    const operation = begin();
    setState((current) => ({ ...current, phase: "applying", error: null, retryAction: null }));
    try {
      const response = await applyEdit(
        state.preview.previewId,
        state.preview.documentId,
        state.preview.baseRevision,
        state.preview.transactionId,
        state.preview.changeCount,
        operation.controller.signal
      );
      if (!complete(operation)) return;
      setState((current) => ({ ...current, phase: "applied", revision: response.revision, error: null, retryAction: null }));
    } catch (reason) {
      if (operation.controller.signal.aborted || !complete(operation)) return;
      const stale = reason instanceof EditClientError && reason.code === "EDIT_PREVIEW_STALE";
      setState((current) => ({
        ...current,
        phase: stale ? "stale" : "error",
        error: stale ? "Preview is stale. Re-preview changes before approval." : messageFor(reason),
        retryAction: stale ? "preview" : "apply"
      }));
    }
  }, [begin, complete, state.phase, state.preview]);

  const reject = useCallback(() => {
    if (busy.current || state.phase !== "ready") return;
    setState((current) => ({ ...current, phase: "rejected", error: null, retryAction: "preview" }));
  }, [state.phase]);

  const transition = useCallback(async (kind: "undo" | "redo") => {
    if (busy.current || !state.preview || state.revision === null) return;
    const operation = begin();
    setState((current) => ({ ...current, phase: kind === "undo" ? "undoing" : "redoing", error: null, retryAction: null }));
    try {
      const response = await (kind === "undo"
        ? undoEdit(
          state.preview.documentId,
          state.revision,
          state.preview.transactionId,
          state.preview.changeCount,
          operation.controller.signal
        )
        : redoEdit(
          state.preview.documentId,
          state.revision,
          state.preview.transactionId,
          state.preview.changeCount,
          operation.controller.signal
        ));
      if (!complete(operation)) return;
      setState((current) => ({
        ...current,
        phase: kind === "undo" ? "undone" : "redone",
        revision: response.revision,
        error: null,
        retryAction: null
      }));
    } catch (reason) {
      if (operation.controller.signal.aborted || !complete(operation)) return;
      setState((current) => ({
        ...current,
        phase: "error",
        error: messageFor(reason),
        retryAction: kind
      }));
    }
  }, [begin, complete, state.preview, state.revision]);

  const retry = useCallback(() => {
    if (state.retryAction === "preview" && batchRef.current) {
      void preview(batchRef.current);
    } else if (state.retryAction === "apply") {
      void approve();
    } else if (state.retryAction === "undo" || state.retryAction === "redo") {
      void transition(state.retryAction);
    }
  }, [approve, preview, state.retryAction, transition]);

  return {
    ...state,
    busy: ["previewing", "applying", "undoing", "redoing"].includes(state.phase),
    approve,
    reject,
    retry,
    rePreview: () => batchRef.current && void preview(batchRef.current),
    undo: () => void transition("undo"),
    redo: () => void transition("redo")
  };
}

function messageFor(reason: unknown) {
  if (reason instanceof EditClientError) return reason.message.slice(0, 240);
  return "Unable to complete the CAD change review.";
}
