import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  Maximize2,
  Minimize2,
  ScanSearch,
  View
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CadViewer } from "../features/cad-viewer/CadViewer";
import type { CadEntity, CadIndex, InspectionRun } from "../shared/types";

type ArtifactTab = "preview" | "findings" | "evidence" | "warnings";

interface Props {
  index: CadIndex;
  run: InspectionRun | null;
  selected: CadEntity | null;
  highlightedHandles: ReadonlySet<string>;
  selectedHandle: string | null;
  searchQuery: string;
  gridVisible: boolean;
  hiddenLayers: ReadonlySet<string>;
  maximized: boolean;
  onGridVisibleChange(visible: boolean): void;
  onMaximizedChange(maximized: boolean): void;
  onSelectFinding(handle: string): void;
}

export function CadArtifactPanel({
  index,
  run,
  selected,
  highlightedHandles,
  selectedHandle,
  searchQuery,
  gridVisible,
  hiddenLayers,
  maximized,
  onGridVisibleChange,
  onMaximizedChange,
  onSelectFinding
}: Props) {
  const [tab, setTab] = useState<ArtifactTab>("preview");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const findingGroups = useMemo(
    () => groupFindings(run?.findings ?? []),
    [run?.findings]
  );

  useEffect(() => {
    if (!maximized) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMaximizedChange(false);
    };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [maximized, onMaximizedChange]);

  return (
    <section
      aria-label="CAD 아티팩트"
      className={`cad-artifact ${maximized ? "maximized" : ""}`}
      data-maximized={maximized}
    >
      <div className="artifact-header">
        <div>
          <strong>{index.source.displayName}</strong>
          <span>Model · {index.summary.modelSpaceCount} entities</span>
        </div>
        <button
          aria-label={maximized ? "아티팩트 복원" : "아티팩트 최대화"}
          className="icon-button"
          onClick={() => onMaximizedChange(!maximized)}
        >
          {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
      <div className="artifact-tabs" role="tablist">
        <Tab active={tab === "preview"} icon={<View size={13} />} label="CAD Preview" onClick={() => setTab("preview")} />
        <Tab active={tab === "findings"} count={run?.findings.length ?? 0} icon={<ScanSearch size={13} />} label="Findings" onClick={() => setTab("findings")} />
        <Tab active={tab === "evidence"} count={selected ? 1 : 0} icon={<FileCheck2 size={13} />} label="Evidence" onClick={() => setTab("evidence")} />
        <Tab active={tab === "warnings"} count={run?.warnings.length ?? 0} icon={<AlertTriangle size={13} />} label="Warnings" onClick={() => setTab("warnings")} />
      </div>
      <div className="artifact-content">
        {tab === "preview" && (
          <CadViewer
            gridVisible={gridVisible}
            highlightedHandles={highlightedHandles}
            hiddenLayers={hiddenLayers}
            index={index}
            onGridVisibleChange={onGridVisibleChange}
            searchQuery={searchQuery}
            selectedHandle={selectedHandle}
            showMaximize={false}
          />
        )}
        {tab === "findings" && (
          <div className="artifact-list">
            {findingGroups.map((group) => (
              <section className="finding-group" key={group.id}>
                <button
                  aria-expanded={expandedGroup === group.id}
                  aria-label={`${group.layer} ${group.type} ${group.findings.length}개`}
                  className="finding-group-heading"
                  onClick={() => setExpandedGroup((current) => current === group.id ? null : group.id)}
                >
                  {expandedGroup === group.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span><strong>{group.layer} · {group.type}</strong><small>{group.findings.length} entities</small></span>
                  <b>{group.findings.length}</b>
                </button>
                {expandedGroup === group.id && (
                  <div className="finding-group-entities">
                    {group.findings.map((finding, indexValue) => (
                      <button
                        aria-label={`${finding.layer} 레이어 검사 결과 ${group.findings.length}개`}
                        className="artifact-card finding-card finding-row"
                        key={`${finding.handle}:${indexValue}`}
                        onClick={() => {
                          if (!finding.handle) return;
                          onSelectFinding(finding.handle);
                          setTab("evidence");
                        }}
                      >
                        <ScanSearch size={15} />
                        <span><strong>{finding.type}</strong><small>handle {finding.handle ?? "none"}</small></span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
            {!run?.findings.length && <Empty>검사를 실행하면 근거가 표시됩니다.</Empty>}
          </div>
        )}
        {tab === "evidence" && (
          selected
            ? <Evidence entity={selected} />
            : <Empty>Finding을 선택하면 handle, layer, type, bbox를 표시합니다.</Empty>
        )}
        {tab === "warnings" && (
          <div className="artifact-list">
            {run?.warnings.map((warning) => (
              <div className="artifact-card warning-card" key={warning}>
                <AlertTriangle size={15} /><span>{warning}</span>
              </div>
            ))}
            {!run?.warnings.length && <Empty>경고가 없습니다.</Empty>}
          </div>
        )}
      </div>
    </section>
  );
}

function groupFindings(findings: InspectionRun["findings"]) {
  const groups = new Map<string, {
    id: string;
    layer: string;
    type: string;
    findings: InspectionRun["findings"];
  }>();
  findings.forEach((finding) => {
    const id = `${finding.layer}\u0000${finding.type}`;
    const group = groups.get(id);
    if (group) {
      group.findings.push(finding);
      return;
    }
    groups.set(id, {
      id,
      layer: finding.layer,
      type: finding.type,
      findings: [finding]
    });
  });
  return [...groups.values()].sort(
    (left, right) =>
      right.findings.length - left.findings.length ||
      left.layer.localeCompare(right.layer) ||
      left.type.localeCompare(right.type)
  );
}

function Tab({ active, icon, label, count, onClick }: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick(): void;
}) {
  return (
    <button aria-selected={active} className={active ? "active" : ""} onClick={onClick} role="tab">
      {icon}{label}{count !== undefined && <b>{count}</b>}
    </button>
  );
}

function Evidence({ entity }: { entity: CadEntity }) {
  return (
    <dl className="evidence-grid" data-testid="evidence-card">
      <div><dt>HANDLE</dt><dd>{entity.handle}</dd></div>
      <div><dt>TYPE</dt><dd>{entity.type}</dd></div>
      <div><dt>LAYER</dt><dd>{entity.layer}</dd></div>
      <div><dt>BOUNDING BOX</dt><dd>{entity.bbox ? JSON.stringify(entity.bbox) : "unavailable"}</dd></div>
    </dl>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="artifact-empty">{children}</div>;
}
