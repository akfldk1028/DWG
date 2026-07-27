import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(frontendRoot, "..");
const project = resolve(repoRoot, "backend/src/DwgIntelligence.DwgParser");
const source = resolve(repoRoot, "tests/fixtures/dwg/export_sample.dwg");
const destination = resolve(frontendRoot, "public/data/export_sample.index.json");

const output = execFileSync(
  "dotnet",
  ["run", "--project", project, "--no-launch-profile", "--", "index", source],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
);
const index = JSON.parse(output);

if (
  index.schemaVersion !== "cad-index/v0.1" ||
  index.source?.kind !== "dwg" ||
  index.entities?.length !== 22
) {
  throw new Error("Generated fixture does not match the verified DWG index contract");
}

mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`Generated ${destination} from unchanged DWG source (${index.entities.length} entities).`);
