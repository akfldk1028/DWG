import { Buffer } from "node:buffer";

export const MAX_REPORT_BYTES = 1_048_576;

export class BoundedTextWriter {
  readonly #chunks: string[] = [];
  #byteLength = 0;

  get byteLength(): number {
    return this.#byteLength;
  }

  append(value: string): void {
    const nextBytes = Buffer.byteLength(value, "utf8");
    if (this.#byteLength + nextBytes > MAX_REPORT_BYTES) {
      throw new Error("EXPORT_REPORT_BYTE_LIMIT");
    }
    this.#chunks.push(value);
    this.#byteLength += nextBytes;
  }

  finish(): string {
    return this.#chunks.join("");
  }
}
