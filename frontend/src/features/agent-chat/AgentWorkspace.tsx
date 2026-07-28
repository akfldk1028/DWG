import {
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  LoaderCircle,
  MessageSquarePlus,
  TerminalSquare
} from "lucide-react";
import { useEffect, useRef } from "react";

import { agents } from "../../shared/agents";
import type {
  InspectionRun,
  ProviderChatResult,
  ProviderId,
  ProviderStatus
} from "../../shared/types";
import { ChatComposer } from "./ChatComposer";
import { ProviderSwitch } from "./ProviderSwitch";
import "./styles.css";

interface Props {
  inspectionRun: InspectionRun | null;
  inspectionLoading: boolean;
  inspectionError: string | null;
  providers: ProviderStatus[];
  selectedProvider: ProviderId;
  onProviderChange(provider: ProviderId): void;
  message: string;
  onMessageChange(message: string): void;
  onSubmit(): void;
  onCancel(): void;
  onNewChat(): void;
  chatLoading: boolean;
  chatResult: ProviderChatResult | null;
  chatError: string | null;
}

export function AgentWorkspace({
  inspectionRun,
  inspectionLoading,
  inspectionError,
  providers,
  selectedProvider,
  onProviderChange,
  message,
  onMessageChange,
  onSubmit,
  onCancel,
  onNewChat,
  chatLoading,
  chatResult,
  chatError
}: Props) {
  const liveResponseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    liveResponseRef.current?.scrollIntoView({ block: "nearest" });
  }, [chatResult]);

  return (
    <aside className="panel agent-workspace" aria-label="에이전트 워크스페이스">
      <div className="agent-tabs">
        <button className="agent-tab active"><Bot size={14} /> 검사 #1</button>
        <button className="agent-tab icon-tab" aria-label="새 대화" onClick={onNewChat}><MessageSquarePlus size={14} /></button>
      </div>

      <div className="agent-context">
        <span className="agent-avatar">DI</span>
        <div>
          <strong>Drawing inspection</strong>
          <span>@export_sample.dwg · OAuth CLI · 7 agents</span>
        </div>
        <ProviderSwitch
          providers={providers}
          selectedProvider={selectedProvider}
          onProviderChange={onProviderChange}
        />
      </div>

      <div className="conversation">
        <div className="message user-message">
          <div className="message-label">YOU</div>
          <p>도면 인덱스를 확인하고 0 레이어의 객체를 근거와 함께 검사해줘.</p>
        </div>

        <div className="message agent-message">
          <div className="message-label"><Bot size={12} /> ORCHESTRATOR</div>
          <p>로컬 DWG 인덱스를 기준으로 객체 검색과 증거 검증을 순서대로 실행합니다.</p>
        </div>

        <div className="tool-stack" aria-label="에이전트 실행 상태">
          {inspectionLoading && (
            <ToolStep label="orchestrator" tool="POST /api/inspections" state="running" />
          )}
          {!inspectionLoading && !inspectionRun && (
            <ToolStep label="orchestrator" tool="검사 실행 대기" state="idle" />
          )}
          {inspectionRun?.events.map((event) => (
            <ToolStep
              key={`${event.sequence}:${event.agentId}:${event.action}`}
              label={event.agentId}
              tool={event.action}
              state={
                event.status === "completed"
                  ? "done"
                  : event.status === "rejected"
                    ? "rejected"
                    : "idle"
              }
            />
          ))}
        </div>

        {inspectionRun?.status === "completed" && (
          <div className="message agent-message response-message">
            <div className="message-label"><Check size={12} /> VERIFIED RESULT</div>
            <p><strong>{inspectionRun.findings.length}개 주요 객체</strong>를 확인했습니다. 모든 결과에 handle, type, layer, bbox가 연결되어 있습니다.</p>
          </div>
        )}
        {inspectionRun?.status === "rejected" && (
          <div className="chat-error" role="alert">
            증거가 불완전하여 검사 결과가 거부됐습니다.
          </div>
        )}
        {inspectionError && <div className="chat-error" role="alert">{inspectionError}</div>}

        {chatResult && (
          <div
            className="message agent-message live-response"
            data-testid="live-response"
            ref={liveResponseRef}
          >
            <div className="message-label"><Check size={12} /> {chatResult.provider === "codex" ? "GPT · CODEX" : "CLAUDE"} · OAUTH SESSION</div>
            <p>{chatResult.text}</p>
            {chatResult.sessionId && <code>{chatResult.sessionId}</code>}
          </div>
        )}
        {chatError && <div className="chat-error" role="alert">{chatError}</div>}

        <div className="specialist-list">
          <div className="subheading">SPECIALISTS</div>
          {agents.map((agent) => (
            <div className="specialist-row" key={agent.id} title={agent.id}>
              <CircleDot size={11} className={agent.state} />
              <div><strong>{agent.label}</strong><span>{agent.role}</span></div>
              <span className={`agent-state ${agent.state}`}>{agent.state}</span>
            </div>
          ))}
        </div>
      </div>

      <ChatComposer
        provider={selectedProvider}
        message={message}
        loading={chatLoading}
        onMessageChange={onMessageChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </aside>
  );
}

function ToolStep({ label, tool, state }: { label: string; tool: string; state: "idle" | "running" | "done" | "rejected" }) {
  return (
    <div className={`tool-step ${state}`}>
      {state === "running" ? <LoaderCircle className="spin" size={14} /> : state === "done" ? <Check size={14} /> : <ChevronRight size={14} />}
      <div><strong>{label}</strong><span><TerminalSquare size={11} /> {tool}</span></div>
      <em>{state === "running" ? "RUNNING" : state === "done" ? "DONE" : state === "rejected" ? "REJECTED" : "QUEUED"}</em>
    </div>
  );
}
