import {
  Bell,
  CheckCircle2,
  Menu,
  PanelRight,
  Play,
  RotateCcw,
  Search,
  Settings2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentWorkspace } from "../features/agent-chat/AgentWorkspace";
import { useProviderChat } from "../features/agent-chat/useProviderChat";
import { useDrawingIndex } from "../features/drawing-explorer/useDrawingIndex";
import { useLayerVisibility } from "../features/drawing-explorer/useLayerVisibility";
import { useInspectionRun } from "../features/inspection-results/useInspectionRun";
import { CadArtifactPanel } from "./CadArtifactPanel";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { clampArtifactWidth, type ThemePreference } from "./workspacePreferences";
import { useWorkspacePreferences } from "./useWorkspacePreferences";
import "./styles.css";

const desktopBreakpoint = 1280;

export function App() {
  const { index, error } = useDrawingIndex();
  const chat = useProviderChat();
  const inspection = useInspectionRun();
  const workspace = useWorkspacePreferences();
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= desktopBreakpoint);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [gridVisible, setGridVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
  const [artifactMaximized, setArtifactMaximized] = useState(false);
  const [narrowArtifactOpen, setNarrowArtifactOpen] = useState(false);
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const desktop = viewportWidth >= desktopBreakpoint;
  const artifactWidth = clampArtifactWidth(
    viewportWidth,
    workspace.preferences.artifactWidth,
    desktop
  );
  const layerVisibility = useLayerVisibility(
    index?.layers.map((layer) => layer.name) ?? []
  );
  const selected = index?.entities.find((entity) => entity.handle === selectedHandle) ?? null;
  const highlightedHandles = useMemo(() => new Set(
    inspection.run?.findings.flatMap((finding) => finding.handle ? [finding.handle] : []) ?? []
  ), [inspection.run]);

  useEffect(() => {
    const resize = () => {
      setViewportWidth(window.innerWidth);
      if (window.innerWidth >= desktopBreakpoint) setSidebarOpen(true);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setNotificationsOpen(false);
      }
    };
    const pointerdown = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
      if (!(event.target as Element).closest?.(".notification-popover, [aria-label='알림']")) {
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointerdown", pointerdown);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("pointerdown", pointerdown);
    };
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragStart.current) return;
      workspace.setArtifactWidth(clampArtifactWidth(
        window.innerWidth,
        dragStart.current.width + dragStart.current.x - event.clientX,
        window.innerWidth >= desktopBreakpoint
      ));
    };
    const end = () => {
      dragStart.current = null;
      document.body.classList.remove("resizing-artifact");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, [workspace]);

  async function runAgents() {
    setSelectedHandle(null);
    await inspection.start([{ kind: "layer", value: "0" }]);
  }

  if (error) {
    return <div className="load-state error-state">DWG 인덱스를 불러오지 못했습니다. {error}</div>;
  }
  if (!index) {
    return <div className="load-state"><span className="loading-mark" /> 로컬 DWG 인덱스를 불러오는 중</div>;
  }

  return (
    <div className="app-shell" data-theme={workspace.resolvedTheme}>
      <header className="topbar">
        <button
          aria-label="탐색 열기"
          className="icon-button menu-button"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <Menu size={17} />
        </button>
        <div className="file-context">
          <strong>{index.source.displayName}</strong>
          <span>Sample review / Model</span>
        </div>
        <div className="index-health"><CheckCircle2 size={13} /> Indexed <b>{index.summary.entityCount}</b></div>
        <label className="global-search">
          <Search size={14} />
          <input
            aria-label="전체 도면 검색"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="handle, layer, type 검색"
            ref={searchRef}
            value={searchQuery}
          />
        </label>
        <button className="run-agents" disabled={inspection.loading} onClick={() => void runAgents()}>
          <Play size={13} /> {inspection.loading ? "Running" : "Run agents"}
        </button>
        {inspection.run && (
          <button
            aria-label="검사 초기화"
            className="icon-button"
            onClick={() => {
              inspection.reset();
              setSelectedHandle(null);
            }}
          >
            <RotateCcw size={14} />
          </button>
        )}
        <button
          aria-label={narrowArtifactOpen ? "CAD 아티팩트 닫기" : "CAD 아티팩트 열기"}
          className="icon-button artifact-toggle"
          onClick={() => setNarrowArtifactOpen((open) => !open)}
        >
          <PanelRight size={15} />
        </button>
        <div className="settings-anchor">
          <button className="icon-button" aria-label="알림" onClick={() => setNotificationsOpen((open) => !open)}><Bell size={15} /></button>
          {notificationsOpen && <div className="notification-popover" role="status">새 알림이 없습니다.</div>}
        </div>
        <div className="settings-anchor" ref={settingsRef}>
          <button
            aria-expanded={settingsOpen}
            aria-label="설정"
            className="icon-button"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings2 size={15} />
          </button>
          {settingsOpen && (
            <div className="settings-popover" role="dialog" aria-label="뷰어 설정">
              <label>
                <span>테마</span>
                <select
                  aria-label="테마"
                  onChange={(event) => workspace.setTheme(event.target.value as ThemePreference)}
                  value={workspace.preferences.theme}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label><input checked={gridVisible} onChange={(event) => setGridVisible(event.target.checked)} type="checkbox" /> CAD grid</label>
            </div>
          )}
        </div>
      </header>

      <div
        className={`workspace-grid ${artifactMaximized ? "artifact-maximized" : ""} ${narrowArtifactOpen ? "artifact-narrow-open" : ""}`}
        style={{ "--artifact-width": `${artifactWidth}px` } as React.CSSProperties}
      >
        {sidebarOpen && (
          <WorkspaceSidebar
            activeSessionId={chat.activeSessionId}
            hiddenLayers={layerVisibility.hiddenLayers}
            index={index}
            onClose={() => setSidebarOpen(false)}
            onNewSession={chat.reset}
            onSelectSession={chat.selectSession}
            onToggleLayer={layerVisibility.toggleLayer}
            onToggleSection={workspace.toggleSection}
            overlay={!desktop}
            sections={workspace.preferences.sidebarSections}
            sessions={chat.sessions}
          />
        )}
        {!desktop && sidebarOpen && <button aria-label="탐색 닫기" className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

        <AgentWorkspace
          activeSession={chat.activeSession}
          chatError={chat.error}
          chatLoading={chat.loading}
          chatResult={chat.result}
          inspectionError={inspection.error}
          inspectionLoading={inspection.loading}
          inspectionRun={inspection.run}
          message={chat.message}
          onCancel={chat.cancel}
          onMessageChange={chat.setMessage}
          onNewChat={chat.reset}
          onProviderChange={chat.setSelectedProvider}
          onSubmit={chat.submit}
          providers={chat.providers}
          selectedProvider={chat.selectedProvider}
        />

        <div
          aria-label="CAD 아티팩트 너비 조절"
          aria-orientation="vertical"
          aria-valuemax={1200}
          aria-valuemin={520}
          aria-valuenow={Math.round(artifactWidth)}
          className="artifact-resizer"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            workspace.setArtifactWidth(clampArtifactWidth(
              viewportWidth,
              artifactWidth + (event.key === "ArrowLeft" ? 32 : -32),
              desktop
            ));
          }}
          onPointerDown={(event) => {
            dragStart.current = { x: event.clientX, width: artifactWidth };
            document.body.classList.add("resizing-artifact");
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          role="separator"
          tabIndex={0}
        />

        <CadArtifactPanel
          gridVisible={gridVisible}
          hiddenLayers={layerVisibility.hiddenLayers}
          highlightedHandles={highlightedHandles}
          index={index}
          maximized={artifactMaximized}
          onGridVisibleChange={setGridVisible}
          onMaximizedChange={setArtifactMaximized}
          onSelectFinding={setSelectedHandle}
          run={inspection.run}
          searchQuery={searchQuery}
          selected={selected}
          selectedHandle={selectedHandle}
        />
      </div>
    </div>
  );
}
