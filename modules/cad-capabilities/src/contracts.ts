import type { CadEntityIndex } from "@dwg/contracts";

export type CadCapabilityName =
  | "document.open"
  | "document.describe"
  | "query.layers"
  | "query.entities"
  | "query.text";

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
