import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  MessageSquare,
  PanelLeftClose,
  Plus
} from "lucide-react";

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

      <SidebarSection
        label="Project"
        open={sections.project}
        onToggle={() => onToggleSection("project")}
      >
        <div className="project-card">
          <FolderOpen size={15} />
          <div><strong>Sample review</strong><span>1 drawing · local</span></div>
        </div>
      </SidebarSection>

      <SidebarSection
        label="Drawing"
        open={sections.drawing}
        onToggle={() => onToggleSection("drawing")}
      >
        <DrawingExplorer
          hiddenLayers={hiddenLayers}
          index={index}
          onToggleLayer={onToggleLayer}
        />
      </SidebarSection>

      <SidebarSection
        action={
          <button className="icon-button" aria-label="새 세션" onClick={onNewSession}>
            <Plus size={14} />
          </button>
        }
        label="Sessions"
        open={sections.sessions}
        onToggle={() => onToggleSection("sessions")}
      >
        <div className="session-list">
          {sessions.map((session) => (
            <button
              className={`session-row ${session.id === activeSessionId ? "active" : ""}`}
              key={session.id}
              onClick={() => onSelectSession(session.id)}
            >
              <MessageSquare size={13} />
              <span><strong>{session.title}</strong><small>{session.provider} · local session</small></span>
            </button>
          ))}
          {sessions.length === 0 && <div className="session-empty">저장된 세션이 없습니다.</div>}
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
