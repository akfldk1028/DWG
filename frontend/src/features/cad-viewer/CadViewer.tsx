import { Crosshair, Focus, Grid3X3, Maximize2, Minimize2, MousePointer2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { CadEntity, CadIndex, Scenario } from "../../shared/types";

interface Props {
  index: CadIndex;
  scenario: Scenario;
  selectedHandle: string | null;
  searchQuery: string;
  gridVisible: boolean;
  onGridVisibleChange(visible: boolean): void;
}

const view = { minX: -24, minY: -12, width: 148, height: 126 };

export function CadViewer({
  index,
  scenario,
  selectedHandle,
  searchQuery,
  gridVisible,
  onGridVisibleChange
}: Props) {
  const [viewMode, setViewMode] = useState<"default" | "fit">("default");
  const [maximized, setMaximized] = useState(false);
  const fitView = useMemo(() => calculateFitView(index.entities), [index.entities]);
  const activeView = viewMode === "fit" ? fitView : view;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const highlightSet =
    scenario === "highlighted"
      ? new Set(["239", "23A", "23B", "23D"])
      : new Set(selectedHandle ? [selectedHandle] : []);

  if (normalizedQuery) {
    index.entities.forEach((entity) => {
      if (
        entity.handle?.toLowerCase().includes(normalizedQuery) ||
        entity.layer.toLowerCase().includes(normalizedQuery) ||
        entity.type.toLowerCase().includes(normalizedQuery)
      ) {
        if (entity.handle) highlightSet.add(entity.handle);
      }
    });
  }

  useEffect(() => {
    if (!maximized) return;
    function exitMaximized(event: KeyboardEvent) {
      if (event.key === "Escape") setMaximized(false);
    }
    window.addEventListener("keydown", exitMaximized);
    return () => window.removeEventListener("keydown", exitMaximized);
  }, [maximized]);

  return (
    <main className={`viewer-shell ${maximized ? "viewer-maximized" : ""}`} aria-label="CAD 뷰어">
      <div className="viewer-toolbar">
        <div className="tool-group">
          <button aria-label="선택" aria-pressed="true" className="tool-button active"><MousePointer2 size={14} /></button>
          <button
            aria-label="전체 보기"
            className={`tool-button ${viewMode === "fit" ? "active" : ""}`}
            onClick={() => setViewMode("fit")}
          >
            <Focus size={14} />
          </button>
          <button
            aria-label="그리드"
            aria-pressed={gridVisible}
            className="tool-button"
            onClick={() => onGridVisibleChange(!gridVisible)}
          >
            <Grid3X3 size={14} />
          </button>
        </div>
        <div className="viewer-crumb">Model <span>/</span> World UCS</div>
        <button
          className={`tool-button ${maximized ? "active" : ""}`}
          aria-label={maximized ? "최대화 종료" : "최대화"}
          onClick={() => setMaximized((value) => !value)}
        >
          {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      <div className="canvas-wrap" data-testid="cad-canvas" data-view={viewMode}>
        <svg
          className="cad-canvas"
          viewBox={`${activeView.minX} ${activeView.minY} ${activeView.width} ${activeView.height}`}
          role="img"
          aria-label={`${index.summary.entityCount}개 객체가 표시된 DWG 도면`}
        >
          <defs>
            <pattern id="minor-grid" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M 5 0 L 0 0 0 5" className="minor-grid" />
            </pattern>
            <pattern id="major-grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <rect width="25" height="25" fill="url(#minor-grid)" />
              <path d="M 25 0 L 0 0 0 25" className="major-grid" />
            </pattern>
          </defs>
          {gridVisible && (
            <rect
              className="cad-grid"
              x={activeView.minX}
              y={activeView.minY}
              width={activeView.width}
              height={activeView.height}
              fill="url(#major-grid)"
            />
          )}
          <g transform="translate(0 102) scale(1 -1)">
            {index.entities.map((entity) => (
              <EntityShape
                entity={entity}
                highlighted={Boolean(entity.handle && highlightSet.has(entity.handle))}
                key={entity.id}
              />
            ))}
          </g>
        </svg>

        <div className="axis-gizmo" aria-hidden="true">
          <span className="axis-y">Y</span><span className="axis-x">X</span>
          <Crosshair size={14} />
        </div>
        <div className="scale-readout">1:100&nbsp;&nbsp;|&nbsp;&nbsp;mm</div>
      </div>

      <div className="viewer-status">
        <span><i className="status-dot ready" /> Indexed</span>
        <span>{index.summary.entityCount} entities</span>
        <span>Model space</span>
        <span className="coordinates">X 50.000&nbsp;&nbsp; Y 50.000&nbsp;&nbsp; Z 0.000</span>
      </div>
    </main>
  );
}

function calculateFitView(entities: CadEntity[]) {
  const boxes = entities.flatMap((entity) => entity.bbox ? [entity.bbox] : []);
  if (boxes.length === 0) return view;
  const minX = Math.min(...boxes.map((box) => box.min[0]));
  const minY = Math.min(...boxes.map((box) => box.min[1]));
  const maxX = Math.max(...boxes.map((box) => box.max[0]));
  const maxY = Math.max(...boxes.map((box) => box.max[1]));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const padding = Math.max(width, height) * 0.08;
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: width + padding * 2,
    height: height + padding * 2
  };
}

function EntityShape({ entity, highlighted }: { entity: CadEntity; highlighted: boolean }) {
  if (!entity.bbox) return null;
  const [x1, y1] = entity.bbox.min;
  const [x2, y2] = entity.bbox.max;
  const width = Math.max(x2 - x1, 0.7);
  const height = Math.max(y2 - y1, 0.7);
  const className = `cad-entity ${highlighted ? "highlighted" : ""}`;

  if (entity.type === "CIRCLE") {
    return <ellipse className={className} data-handle={entity.handle} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={width / 2} ry={height / 2} />;
  }
  if (entity.type === "ELLIPSE" || entity.type === "ARC") {
    return <ellipse className={className} data-handle={entity.handle} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={width / 2} ry={height / 2} fill="none" />;
  }
  if (entity.type === "POINT" || entity.type.includes("TEXT")) {
    return <circle className={className} data-handle={entity.handle} cx={x1} cy={y1} r={entity.type === "POINT" ? 1.8 : 1.2} />;
  }
  if (entity.type === "LINE") {
    return <line className={className} data-handle={entity.handle} x1={x1} y1={y1} x2={x2} y2={y2} />;
  }
  return <rect className={className} data-handle={entity.handle} x={x1} y={y1} width={width} height={height} fill="none" />;
}
