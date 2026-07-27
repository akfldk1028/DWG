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
import { useState } from "react";

import { AgentWorkspace } from "../features/agent-chat/AgentWorkspace";
import { useProviderChat } from "../features/agent-chat/useProviderChat";
import { CadViewer } from "../features/cad-viewer/CadViewer";
import { DrawingExplorer } from "../features/drawing-explorer/DrawingExplorer";
import { useDrawingIndex } from "../features/drawing-explorer/useDrawingIndex";
import { useLayerVisibility } from "../features/drawing-explorer/useLayerVisibility";
import { InspectionDock } from "../features/inspection-results/InspectionDock";
import type { Scenario } from "../shared/types";
import { useWorkspaceControls } from "./useWorkspaceControls";

export function App() {
  const { index, error } = useDrawingIndex();
  const chat = useProviderChat();
  const {
    agentPanelOpen,
    activePopover,
    gridVisible,
    searchQuery,
    searchRef,
    topActionsRef,
    setActivePopover,
    setAgentPanelOpen,
    setGridVisible,
    setSearchQuery
  } = useWorkspaceControls();
  const layerVisibility = useLayerVisibility(
    index?.layers.map((layer) => layer.name) ?? []
  );
  const [scenario, setScenario] = useState<Scenario>("loaded");
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
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
        <label className="global-search">
          <Search size={14} />
          <input
            aria-label="전체 도면 검색"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="객체, handle, layer 검색"
            ref={searchRef}
            value={searchQuery}
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="top-actions" ref={topActionsRef}>
          <button
            aria-expanded={activePopover === "notifications"}
            aria-label="알림"
            className={activePopover === "notifications" ? "active" : ""}
            onClick={() => setActivePopover((current) => current === "notifications" ? null : "notifications")}
          >
            <Bell size={15} />
          </button>
          <button
            aria-label={agentPanelOpen ? "패널 닫기" : "패널 열기"}
            aria-pressed={agentPanelOpen}
            onClick={() => setAgentPanelOpen((open) => !open)}
          >
            <PanelRight size={15} />
          </button>
          <button
            aria-expanded={activePopover === "settings"}
            aria-label="설정"
            className={activePopover === "settings" ? "active" : ""}
            onClick={() => setActivePopover((current) => current === "settings" ? null : "settings")}
          >
            <Settings2 size={15} />
          </button>
          {activePopover === "notifications" && (
            <div className="action-popover notification-popover" role="status">
              <strong>알림</strong>
              <span>새 알림이 없습니다.</span>
            </div>
          )}
          {activePopover === "settings" && (
            <div aria-label="뷰어 설정" className="action-popover settings-popover" role="dialog">
              <strong>뷰어 설정</strong>
              <label>
                <input
                  checked={gridVisible}
                  onChange={(event) => setGridVisible(event.target.checked)}
                  type="checkbox"
                />
                그리드 표시
              </label>
            </div>
          )}
        </div>
      </header>

      <nav className="scenario-bar" aria-label="검증 시나리오">
        <span><Command size={13} /> VISUAL LOOP</span>
        <button className={scenario === "loaded" ? "active" : ""} onClick={() => chooseScenario("loaded")}><RotateCcw size={12} /> Loaded</button>
        <button className={scenario === "running" ? "active" : ""} onClick={() => chooseScenario("running")}><Play size={12} /> Run agents</button>
        <button className={scenario === "highlighted" ? "active" : ""} onClick={() => chooseScenario("highlighted")}><FileSearch size={12} /> Highlight</button>
        <button className={scenario === "warning" ? "active" : ""} onClick={() => chooseScenario("warning")}>Warning</button>
      </nav>

      <div className={`workspace-grid ${agentPanelOpen ? "" : "agent-panel-hidden"}`}>
        <DrawingExplorer
          hiddenLayers={layerVisibility.hiddenLayers}
          index={index}
          onToggleLayer={layerVisibility.toggleLayer}
        />
        <CadViewer
          gridVisible={gridVisible}
          hiddenLayers={layerVisibility.hiddenLayers}
          index={index}
          onGridVisibleChange={setGridVisible}
          scenario={scenario}
          searchQuery={searchQuery}
          selectedHandle={selectedHandle}
        />
        {agentPanelOpen && (
          <AgentWorkspace
            scenario={scenario}
            providers={chat.providers}
            selectedProvider={chat.selectedProvider}
            onProviderChange={chat.setSelectedProvider}
            message={chat.message}
            onMessageChange={chat.setMessage}
            onSubmit={chat.submit}
            onCancel={chat.cancel}
            onNewChat={chat.reset}
            chatLoading={chat.loading}
            chatResult={chat.result}
            chatError={chat.error}
          />
        )}
        <InspectionDock
          scenario={scenario}
          selected={selected}
          onSelectFinding={() => chooseScenario("finding")}
        />
      </div>
    </div>
  );
}
