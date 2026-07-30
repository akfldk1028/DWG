import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileBox,
  Layers3,
  LayoutTemplate
} from "lucide-react";
import { useMemo, useState } from "react";

import type { CadIndex } from "../../shared/types";
import "./styles.css";

interface Props {
  index: CadIndex;
  hiddenLayers: ReadonlySet<string>;
  query: string;
  onToggleLayer(layerName: string): void;
}

export function ProjectNavigator({ index, hiddenLayers, query, onToggleLayer }: Props) {
  const [layoutsOpen, setLayoutsOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const layouts = useMemo(() => [...new Set(index.entities.map((entity) => entity.layout))], [index.entities]);
  const layers = index.layers.filter((layer) => layer.name.toLocaleLowerCase().includes(normalizedQuery));

  return (
    <section aria-label="Project" className="project-navigation" role="region">
      <div className="project-navigation-scroll">
        <div aria-label="Drawing hierarchy" className="project-tree" role="tree">
          <div aria-expanded="true" aria-level={1} className="project-tree-root" role="treeitem">
            <FileBox aria-hidden="true" size={15} />
            <span className="project-name" title={index.source.displayName}>{index.source.displayName}</span>
          </div>
          <button
            aria-expanded={layoutsOpen}
            aria-level={2}
            className="project-tree-heading"
            onClick={() => setLayoutsOpen((open) => !open)}
            role="treeitem"
          >
            {layoutsOpen ? <ChevronDown aria-hidden="true" size={14} /> : <ChevronRight aria-hidden="true" size={14} />}
            <LayoutTemplate aria-hidden="true" size={14} />
            <span>Layouts</span><span className="project-tree-count">{layouts.length}</span>
          </button>
          {layoutsOpen && layouts.map((layout) => (
            <div aria-level={3} className="project-layout-row layout-row" key={layout} role="treeitem" title={layout}>
              <LayoutTemplate aria-hidden="true" size={13} /><span>{layout}</span>
            </div>
          ))}

          <button
            aria-expanded={layersOpen}
            aria-level={2}
            className="project-tree-heading"
            onClick={() => setLayersOpen((open) => !open)}
            role="treeitem"
          >
            {layersOpen ? <ChevronDown aria-hidden="true" size={14} /> : <ChevronRight aria-hidden="true" size={14} />}
            <Layers3 aria-hidden="true" size={14} />
            <span>Layers</span><span className="project-tree-count">{index.layers.length}</span>
          </button>
          {layersOpen && <div className="project-layer-header" role="presentation"><span /><span>Eye</span><span>Lock</span><span>Color</span><span>Count</span></div>}
          {layersOpen && layers.map((layer) => {
            const hidden = hiddenLayers.has(layer.name);
            return (
              <div aria-level={3} className="project-layer-row layer-row" key={layer.name} role="treeitem">
                <span className="project-layer-controls">
                  <button
                    aria-label={`${hidden ? "Show" : "Hide"} layer ${layer.name}`}
                    aria-pressed={hidden}
                    className="layer-visibility-button"
                    onClick={() => onToggleLayer(layer.name)}
                    type="button"
                  >
                    {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <span aria-label="Lock unavailable from index" className="project-layer-lock">—</span>
                  <span aria-label="Color unavailable from index" className="project-layer-color">—</span>
                  <span aria-label={`${layer.entityCount} objects`} className="project-layer-count">{layer.entityCount}</span>
                </span>
                <span className="project-layer-name" title={layer.name}>{layer.name}</span>
              </div>
            );
          })}
          {layersOpen && layers.length === 0 && <div className="project-navigation-empty">No matching layers.</div>}
        </div>
      </div>
      <footer className="project-navigation-footer"><span>{index.summary.entityCount} objects</span><span>{index.schemaVersion}</span></footer>
    </section>
  );
}
