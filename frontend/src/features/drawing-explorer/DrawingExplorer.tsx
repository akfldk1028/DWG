import {
  Box,
  ChevronDown,
  Eye,
  FileBox,
  Layers3,
  LayoutTemplate,
  Search
} from "lucide-react";

import type { CadIndex } from "../../shared/types";

interface Props {
  index: CadIndex;
}

export function DrawingExplorer({ index }: Props) {
  return (
    <aside className="panel explorer" aria-label="도면 탐색기">
      <div className="panel-heading">
        <span>DRAWING</span>
        <button className="icon-button" aria-label="도면 검색"><Search size={14} /></button>
      </div>

      <div className="tree-row tree-root">
        <ChevronDown size={14} />
        <FileBox size={15} />
        <span>{index.source.displayName}</span>
      </div>

      <div className="tree-section">
        <div className="tree-row">
          <ChevronDown size={13} />
          <LayoutTemplate size={14} />
          <span>Layouts</span>
          <span className="count">1</span>
        </div>
        <div className="tree-row tree-child selected-row">
          <span className="tree-guide" />
          <Box size={13} />
          <span>Model</span>
        </div>
      </div>

      <div className="tree-section">
        <div className="tree-row">
          <ChevronDown size={13} />
          <Layers3 size={14} />
          <span>Layers</span>
          <span className="count">{index.layers.length}</span>
        </div>
        {index.layers.map((layer) => (
          <div className="tree-row tree-child" key={layer.name}>
            <Eye size={13} />
            <span className="layer-swatch" />
            <span className="truncate">{layer.name === "0" ? "0 · Default" : layer.name}</span>
            <span className="count">{layer.entityCount}</span>
          </div>
        ))}
      </div>

      <div className="explorer-summary">
        <div><span>Objects</span><strong>{index.summary.entityCount}</strong></div>
        <div><span>Parser</span><strong>ACadSharp</strong></div>
        <div><span>Schema</span><strong>v0.1</strong></div>
      </div>
    </aside>
  );
}
