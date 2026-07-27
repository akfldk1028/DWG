import { AlertTriangle, Box, CheckCircle2, FileCheck2, ScanSearch } from "lucide-react";

import type { CadEntity, Scenario } from "../../shared/types";

interface Props {
  scenario: Scenario;
  selected: CadEntity | null;
  onSelectFinding: () => void;
}

export function InspectionDock({ scenario, selected, onSelectFinding }: Props) {
  const warning = scenario === "warning";

  return (
    <section className="inspection-dock" aria-label="검사 결과">
      <div className="dock-tabs">
        <button className="dock-tab active"><ScanSearch size={13} /> Findings <b>1</b></button>
        <button className="dock-tab"><FileCheck2 size={13} /> Evidence <b>{selected ? 1 : 0}</b></button>
        <button className={`dock-tab ${warning ? "has-warning" : ""}`}><AlertTriangle size={13} /> Warnings <b>{warning ? 1 : 0}</b></button>
      </div>

      <div className="dock-content">
        <button className={`finding-row ${selected ? "selected" : ""}`} onClick={onSelectFinding}>
          <span className="finding-severity"><CheckCircle2 size={14} /></span>
          <span className="finding-main">
            <strong>0 레이어 주요 형상 확인</strong>
            <small>검색 결과 4개 · 증거 검증 통과</small>
          </span>
          <span className="finding-rule">IDX-LAYER-001</span>
          <span className="finding-status">VERIFIED</span>
        </button>

        <div className="evidence-card" data-testid="evidence-card">
          {selected ? (
            <>
              <div className="evidence-title"><Box size={14} /> Entity evidence <strong>{selected.id}</strong></div>
              <dl>
                <div><dt>HANDLE</dt><dd>{selected.handle}</dd></div>
                <div><dt>TYPE</dt><dd>{selected.type}</dd></div>
                <div><dt>LAYER</dt><dd>{selected.layer}</dd></div>
                <div className="bbox-value"><dt>BOUNDING BOX</dt><dd>{formatBox(selected)}</dd></div>
              </dl>
            </>
          ) : (
            <div className="empty-evidence">Finding을 선택하면 객체 근거와 bounding box가 표시됩니다.</div>
          )}
        </div>

        {warning && (
          <div className="warning-card" role="alert">
            <AlertTriangle size={14} />
            <div><strong>부분 지원 객체</strong><span>AEC 프록시 객체의 형상 경계를 읽을 수 없습니다.</span></div>
            <code>bbox-not-implemented</code>
          </div>
        )}
      </div>
    </section>
  );
}

function formatBox(entity: CadEntity) {
  if (!entity.bbox) return "unavailable";
  const round = (value: number) => Number(value.toFixed(2));
  return `[${round(entity.bbox.min[0])}, ${round(entity.bbox.min[1])}] → [${round(entity.bbox.max[0])}, ${round(entity.bbox.max[1])}]`;
}
