import {
  Box,
  ChevronDown,
  Eye,
  EyeOff,
  FileBox,
  Layers3,
  LayoutTemplate,
  Search,
  X
} from "lucide-react";
import { useRef, useState } from "react";

import type { CadIndex } from "../../shared/types";
import "./layer-visibility.css";

interface Props {
  index: CadIndex;
  hiddenLayers: ReadonlySet<string>;
  onToggleLayer(layerName: string): void;
}

export function DrawingExplorer({
  index,
  hiddenLayers,
  onToggleLayer
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const visibleLayers = index.layers.filter((layer) =>
    layer.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  function toggleSearch() {
    setSearchOpen((open) => {
      if (!open) window.setTimeout(() => searchRef.current?.focus(), 0);
      if (open) setQuery("");
      return !open;
    });
  }

  return (
    <aside className="panel explorer" aria-label="도면 탐색기">
      <div className="panel-heading">
        <span>DRAWING</span>
        <button
          aria-expanded={searchOpen}
          aria-label="도면 검색"
          className={`icon-button ${searchOpen ? "active" : ""}`}
          onClick={toggleSearch}
        >
          {searchOpen ? <X size={14} /> : <Search size={14} />}
        </button>
      </div>

      {searchOpen && (
        <label className="explorer-search">
          <Search size={13} />
          <input
            aria-label="레이어 검색"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="레이어 검색"
            ref={searchRef}
            value={query}
          />
        </label>
      )}

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
        {visibleLayers.map((layer) => (
          <div className="tree-row tree-child layer-row" key={layer.name}>
            <button
              aria-label={`${layer.name} 레이어 ${hiddenLayers.has(layer.name) ? "표시" : "숨기기"}`}
              aria-pressed={hiddenLayers.has(layer.name)}
              className="layer-visibility-button"
              onClick={() => onToggleLayer(layer.name)}
              type="button"
            >
              {hiddenLayers.has(layer.name) ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <span className="layer-swatch" />
            <span className="truncate">{layer.name === "0" ? "0 · Default" : layer.name}</span>
            <span className="count">{layer.entityCount}</span>
          </div>
        ))}
        {visibleLayers.length === 0 && <div className="tree-empty">일치하는 레이어가 없습니다.</div>}
      </div>

      <div className="explorer-summary">
        <div><span>Objects</span><strong>{index.summary.entityCount}</strong></div>
        <div><span>Parser</span><strong>ACadSharp</strong></div>
        <div><span>Schema</span><strong>v0.1</strong></div>
      </div>
    </aside>
  );
}
