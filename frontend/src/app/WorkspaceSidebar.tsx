import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  MessageSquare,
  MessageSquarePlus,
  PanelLeftClose,
  Search
} from "lucide-react";
import { useState } from "react";

import { DrawingExplorer } from "../features/drawing-explorer/DrawingExplorer";
import type { WorkspaceSession } from "../features/agent-chat/workspaceSessionStore";
import type { CadIndex } from "../shared/types";
import type { WorkspacePreferences } from "./workspacePreferences";

interface Props {
  index: CadIndex;
  hiddenLayers: ReadonlySet<string>;
  sessions: WorkspaceSession[];
  activeSessionId: string | null;
  sections: WorkspacePreferences["sidebarSections"];
  overlay: boolean;
  onClose(): void;
  onNewSession(): void;
  onSelectSession(id: string): void;
  onToggleLayer(layerName: string): void;
  onToggleSection(section: keyof WorkspacePreferences["sidebarSections"]): void;
}

export function WorkspaceSidebar({
  index,
  hiddenLayers,
  sessions,
  activeSessionId,
  sections,
  overlay,
  onClose,
  onNewSession,
  onSelectSession,
  onToggleLayer,
  onToggleSection
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionQuery, setSessionQuery] = useState("");
  const visibleSessions = sessions.filter((session) =>
    session.title.toLocaleLowerCase().includes(sessionQuery.trim().toLocaleLowerCase())
  );

  return (
    <aside className={`workspace-sidebar ${overlay ? "overlay" : ""}`} aria-label="워크스페이스 탐색">
      <div className="sidebar-heading">
        <div className="brand-mark">DI</div>
        <strong>DWG Intelligence</strong>
        {overlay && (
          <button className="icon-button" aria-label="탐색 닫기" onClick={onClose}>
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      <div className="sidebar-primary-actions">
        <button aria-label="새 대화" onClick={onNewSession}>
          <MessageSquarePlus size={15} /> 새 대화
        </button>
        <button aria-label="검색" onClick={() => setSearchOpen((open) => !open)}>
          <Search size={15} /> 검색
        </button>
        {searchOpen && (
          <label className="sidebar-search">
            <Search size={13} />
            <input
              aria-label="워크스페이스 검색"
              autoFocus
              onChange={(event) => setSessionQuery(event.target.value)}
              placeholder="대화 검색"
              value={sessionQuery}
            />
          </label>
        )}
      </div>

      <SidebarSection
        label="Project"
        open={sections.project}
        onToggle={() => onToggleSection("project")}
      >
        <div className="project-card">
          <FolderOpen size={15} />
          <div><strong>Sample review</strong><span>1 drawing · local</span></div>
        </div>
        <div className="project-drawing">
          <button
            aria-expanded={sections.drawing}
            className="nested-drawing-heading"
            onClick={() => onToggleSection("drawing")}
          >
            {sections.drawing ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Drawing
          </button>
          {sections.drawing && (
            <DrawingExplorer
              hiddenLayers={hiddenLayers}
              index={index}
              onToggleLayer={onToggleLayer}
            />
          )}
        </div>
      </SidebarSection>

      <SidebarSection
        label="Recents"
        open={sections.sessions}
        onToggle={() => onToggleSection("sessions")}
      >
        <div className="session-list">
          {visibleSessions.map((session) => (
            <button
              className={`session-row ${session.id === activeSessionId ? "active" : ""}`}
              key={session.id}
              onClick={() => onSelectSession(session.id)}
            >
              <MessageSquare size={13} />
              <span><strong>{session.title}</strong><small>{session.provider} · local session</small></span>
            </button>
          ))}
          {visibleSessions.length === 0 && <div className="session-empty">저장된 대화가 없습니다.</div>}
        </div>
      </SidebarSection>

      <div className="sidebar-footer">
        <span>{index.summary.entityCount} objects</span>
        <span>{index.schemaVersion}</span>
      </div>
    </aside>
  );
}

function SidebarSection({
  label,
  open,
  action,
  onToggle,
  children
}: {
  label: string;
  open: boolean;
  action?: React.ReactNode;
  onToggle(): void;
  children: React.ReactNode;
}) {
  return (
    <section className={`sidebar-section sidebar-section-${label.toLowerCase()}`}>
      <div className="sidebar-section-heading">
        <button aria-expanded={open} onClick={onToggle}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {label}
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}
