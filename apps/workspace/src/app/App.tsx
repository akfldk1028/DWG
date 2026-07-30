import {
  Bell,
  Menu,
  PanelRight,
  Settings2
} from "lucide-react";
import { useMemo, useState } from "react";

import { AgentWorkspace } from "../features/agent-chat/AgentWorkspace";
import { useProviderChat } from "../features/agent-chat/useProviderChat";
import { useDrawingIndex } from "../features/drawing-explorer/useDrawingIndex";
import { useLayerVisibility } from "../features/drawing-explorer/useLayerVisibility";
import { useInspectionRun } from "../features/inspection-results/useInspectionRun";
import { CadArtifactPanel } from "./CadArtifactPanel";
import { useWorkspaceControls } from "./useWorkspaceControls";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import type { ThemePreference } from "./workspacePreferences";
import { useWorkspacePreferences } from "./useWorkspacePreferences";
import "./styles.css";

export function App() {
  const { index, error } = useDrawingIndex();
  const chat = useProviderChat();
  const inspection = useInspectionRun();
  const workspace = useWorkspacePreferences();
  const {
    artifactMaximized,
    artifactOpen,
    artifactWidth,
    desktop,
    gridVisible,
    notificationsOpen,
    searchQuery,
    searchRef,
    menuButtonRef,
    sidebarWidth,
    settingsOpen,
    sidebarOpen,
    topActionsRef,
    closeSidebar,
    resizeArtifactBy,
    resizeSidebarBy,
    setArtifactMaximized,
    setArtifactOpen,
    setGridVisible,
    setNotificationsOpen,
    setSearchQuery,
    setSettingsOpen,
    startArtifactResize,
    startSidebarResize,
    toggleSidebarFromMenu
  } = useWorkspaceControls({
    preferredArtifactWidth: workspace.preferences.artifactWidth,
    preferredSidebarWidth: workspace.preferences.sidebarWidth,
    setPreferredArtifactWidth: workspace.setArtifactWidth,
    setPreferredSidebarWidth: workspace.setSidebarWidth
  });
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
  const [sidebarQuery, setSidebarQuery] = useState("");

  const layerVisibility = useLayerVisibility(
    index?.layers ?? []
  );
  const selected = index?.entities.find((entity) => entity.handle === selectedHandle) ?? null;
  const highlightedHandles = useMemo(() => new Set(
    inspection.run?.findings.flatMap((finding) => finding.handle ? [finding.handle] : []) ?? []
  ), [inspection.run]);

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
          onClick={toggleSidebarFromMenu}
          ref={menuButtonRef}
        >
          <Menu size={17} />
        </button>
        <div className="file-context">
          <strong>Drawing review</strong>
          <span>Local CAD workspace</span>
        </div>
        {!artifactOpen && (
          <button
            aria-label="CAD 아티팩트 열기"
            className="icon-button artifact-toggle"
            onClick={() => setArtifactOpen(true)}
          >
            <PanelRight size={15} />
          </button>
        )}
        <div className="topbar-actions" ref={topActionsRef}>
          <div className="settings-anchor">
            <button className="icon-button" aria-label="알림" onClick={() => setNotificationsOpen((open) => !open)}><Bell size={15} /></button>
            {notificationsOpen && <div className="notification-popover" role="status">새 알림이 없습니다.</div>}
          </div>
          <div className="settings-anchor">
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
        </div>
      </header>

      <div
        className={`workspace-grid ${artifactMaximized ? "artifact-maximized" : ""} ${artifactOpen ? "" : "artifact-closed"}`}
        style={{
          "--artifact-width": `${artifactWidth}px`,
          "--sidebar-width": `${sidebarWidth}px`
        } as React.CSSProperties}
      >
        {sidebarOpen && (
          <WorkspaceSidebar
            activeSessionId={chat.activeSessionId}
            hiddenLayers={layerVisibility.hiddenLayers}
            index={index}
            onClose={closeSidebar}
            onNewSession={chat.reset}
            onQueryChange={setSidebarQuery}
            onSelectSession={chat.selectSession}
            onSelectTab={workspace.setSidebarTab}
            onToggleLayer={layerVisibility.toggleLayer}
            overlay={!desktop}
            query={sidebarQuery}
            sessions={chat.sessions}
            tab={workspace.preferences.sidebarTab}
          />
        )}
        {!desktop && sidebarOpen && <button aria-label="탐색 닫기" className="sidebar-scrim" onClick={closeSidebar} />}

        {desktop && sidebarOpen && (
          <div
            aria-label="Sidebar width"
            aria-orientation="vertical"
            aria-valuemax={420}
            aria-valuemin={280}
            aria-valuenow={Math.round(sidebarWidth)}
            className="sidebar-resizer"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                resizeSidebarBy(-16);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                resizeSidebarBy(16);
              } else if (event.key === "Home") {
                event.preventDefault();
                resizeSidebarBy(280 - sidebarWidth);
              } else if (event.key === "End") {
                event.preventDefault();
                resizeSidebarBy(420 - sidebarWidth);
              }
            }}
            onPointerDown={startSidebarResize}
            role="separator"
            tabIndex={0}
          />
        )}

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

        {artifactOpen && (
          <>
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
                resizeArtifactBy(event.key === "ArrowLeft" ? 32 : -32);
              }}
              onPointerDown={startArtifactResize}
              role="separator"
              tabIndex={0}
            />

            <CadArtifactPanel
              gridVisible={gridVisible}
              hiddenLayers={layerVisibility.hiddenLayers}
              highlightedHandles={highlightedHandles}
              index={index}
              inspectionLoading={inspection.loading}
              maximized={artifactMaximized}
              onClose={() => {
                setArtifactMaximized(false);
                setArtifactOpen(false);
              }}
              onGridVisibleChange={setGridVisible}
              onMaximizedChange={setArtifactMaximized}
              onResetInspection={() => {
                inspection.reset();
                setSelectedHandle(null);
              }}
              onRunAgents={() => void runAgents()}
              onSearchQueryChange={setSearchQuery}
              onSelectFinding={setSelectedHandle}
              run={inspection.run}
              searchInputRef={searchRef}
              searchQuery={searchQuery}
              selected={selected}
              selectedHandle={selectedHandle}
            />
          </>
        )}
      </div>
    </div>
  );
}
