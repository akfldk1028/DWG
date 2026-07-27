import type { CadEntityIndex } from "../../domain/cad-index/types.js";

const maxEntities = 200;
const maxTextLength = 500;

export function buildCadContext(index: CadEntityIndex): string {
  const typeCounts = new Map<string, number>();
  for (const entity of index.entities) {
    typeCounts.set(entity.type, (typeCounts.get(entity.type) ?? 0) + 1);
  }

  const lines = [
    `schema=${index.schemaVersion}`,
    `drawingId=${index.drawingId}`,
    `source=${index.source.kind}:${clean(index.source.displayName)} parser=${index.source.parser}`,
    `summary entities=${index.summary.entityCount} layers=${index.summary.layerCount} unsupported=${index.summary.unsupportedCount}`,
    `types=${[...typeCounts.entries()].map(([type, count]) => `${type}:${count}`).join(",")}`,
    `layers=${index.layers.map((layer) => `${clean(layer.name)}:${layer.entityCount}`).join(",")}`,
    "entities:"
  ];

  for (const entity of index.entities.slice(0, maxEntities)) {
    const details = [
      `id=${clean(entity.id)}`,
      `handle=${clean(entity.handle ?? "none")}`,
      `type=${clean(entity.type)}`,
      `layer=${clean(entity.layer)}`,
      `layout=${clean(entity.layout)}`,
      `bbox=${formatBox(entity.bbox)}`
    ];
    if (entity.text) details.push(`text=${JSON.stringify(clean(entity.text).slice(0, maxTextLength))}`);
    if (entity.blockName) details.push(`block=${JSON.stringify(clean(entity.blockName))}`);
    if (entity.warnings.length > 0) details.push(`warnings=${entity.warnings.map(clean).join(",")}`);
    lines.push(`- ${details.join(" ")}`);
  }

  if (index.entities.length > maxEntities) {
    lines.push(`truncated=${index.entities.length - maxEntities} entities omitted`);
  }
  if (index.unsupported.length > 0) {
    lines.push(
      `unsupported=${index.unsupported
        .map((item) => `${clean(item.type)}:${item.count}:${clean(item.reason)}`)
        .join("|")}`
    );
  }

  return lines.join("\n");
}

function formatBox(box: CadEntityIndex["entities"][number]["bbox"]) {
  if (!box) return "unavailable";
  return `[${box.min.join(",")}]→[${box.max.join(",")}]`;
}

function clean(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\r?\n/g, "\\n");
}
