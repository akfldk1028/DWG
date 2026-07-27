import {
  Bell,
  Box,
  CheckCircle2,
  ChevronDown,
  Command,
  FileSearch,
  FolderOpen,
  PanelRight,
  Play,
  RotateCcw,
  Search,
  Settings2
} from "lucide-react";
import { useEffect, useState } from "react";

import { AgentWorkspace } from "../features/agent-chat/AgentWorkspace";
import { CadViewer } from "../features/cad-viewer/CadViewer";
import { DrawingExplorer } from "../features/drawing-explorer/DrawingExplorer";
import { InspectionDock } from "../features/inspection-results/InspectionDock";
import type { CadIndex, Scenario } from "../shared/types";

export function App() {
  const [index, setIndex] = useState<CadIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>("loaded");
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/export_sample.index.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CadIndex>;
      })
      .then(setIndex)
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  const selected = index?.entities.find((entity) => entity.handle === selectedHandle) ?? null;

  function chooseScenario(next: Scenario) {
    setScenario(next);
    setSelectedHandle(next === "finding" ? "23D" : null);
  }

  if (error) {
    return <div className="load-state error-state">DWG 인덱스를 불러오지 못했습니다: {error}</div>;
  }
  if (!index) {
    return <div className="load-state"><span className="loading-mark" /> 로컬 DWG 인덱스를 불러오는 중…</div>;
  }

  return (
    <div className="app-shell" data-scenario={scenario}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Box size={16} /></span><strong>DWG Intelligence</strong></div>
        <div className="project-switcher"><FolderOpen size={14} /><span>Sample review</span><ChevronDown size={12} /></div>
        <div className="file-pill"><span className="file-icon">DWG</span><strong>{index.source.displayName}</strong><span>·</span><span>Model</span></div>
        <div className="index-health"><CheckCircle2 size={13} /><span>Indexed</span><b>{index.summary.entityCount}</b></div>
        <label className="global-search"><Search size={14} /><input aria-label="도면 검색" placeholder="객체, handle, layer 검색" /><kbd>⌘ K</kbd></label>
        <div className="top-actions">
          <button aria-label="알림"><Bell size={15} /></button>
          <button aria-label="패널"><PanelRight size={15} /></button>
          <button aria-label="설정"><Settings2 size={15} /></button>
        </div>
      </header>

      <nav className="scenario-bar" aria-label="검증 시나리오">
        <span><Command size={13} /> VISUAL LOOP</span>
        <button className={scenario === "loaded" ? "active" : ""} onClick={() => chooseScenario("loaded")}><RotateCcw size={12} /> Loaded</button>
        <button className={scenario === "running" ? "active" : ""} onClick={() => chooseScenario("running")}><Play size={12} /> Run agents</button>
        <button className={scenario === "highlighted" ? "active" : ""} onClick={() => chooseScenario("highlighted")}><FileSearch size={12} /> Highlight</button>
        <button className={scenario === "warning" ? "active" : ""} onClick={() => chooseScenario("warning")}>Warning</button>
      </nav>

      <div className="workspace-grid">
        <DrawingExplorer index={index} />
        <CadViewer index={index} scenario={scenario} selectedHandle={selectedHandle} />
        <AgentWorkspace scenario={scenario} />
        <InspectionDock
          scenario={scenario}
          selected={selected}
          onSelectFinding={() => chooseScenario("finding")}
        />
      </div>
    </div>
  );
}
