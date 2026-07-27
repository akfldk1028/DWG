import {
  AtSign,
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  LoaderCircle,
  MessageSquarePlus,
  Paperclip,
  Send,
  TerminalSquare
} from "lucide-react";
import { useEffect, useRef } from "react";

import { agents } from "../../shared/agents";
import type {
  ProviderChatResult,
  ProviderId,
  ProviderStatus,
  Scenario
} from "../../shared/types";

interface Props {
  scenario: Scenario;
  providers: ProviderStatus[];
  selectedProvider: ProviderId;
  onProviderChange(provider: ProviderId): void;
  message: string;
  onMessageChange(message: string): void;
  onSubmit(): void;
  chatLoading: boolean;
  chatResult: ProviderChatResult | null;
  chatError: string | null;
}

export function AgentWorkspace({
  scenario,
  providers,
  selectedProvider,
  onProviderChange,
  message,
  onMessageChange,
  onSubmit,
  chatLoading,
  chatResult,
  chatError
}: Props) {
  const running = scenario === "running";
  const completed = scenario === "highlighted" || scenario === "finding" || scenario === "warning";
  const liveResponseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    liveResponseRef.current?.scrollIntoView({ block: "nearest" });
  }, [chatResult]);

  return (
    <aside className="panel agent-workspace" aria-label="에이전트 워크스페이스">
      <div className="agent-tabs">
        <button className="agent-tab active"><Bot size={14} /> 검사 #1</button>
        <button className="agent-tab icon-tab" aria-label="새 대화"><MessageSquarePlus size={14} /></button>
      </div>

      <div className="agent-context">
        <span className="agent-avatar">DI</span>
        <div>
          <strong>Drawing inspection</strong>
          <span>@export_sample.dwg · OAuth CLI · 7 agents</span>
        </div>
        <div className="provider-switch" aria-label="AI provider">
          {(["codex", "claude"] as const).map((providerId) => {
            const status = providers.find((provider) => provider.id === providerId);
            return (
              <button
                className={selectedProvider === providerId ? "active" : ""}
                disabled={!status?.authenticated}
                key={providerId}
                onClick={() => onProviderChange(providerId)}
                title={status?.detail ?? "상태 확인 중"}
              >
                <i className={status?.authenticated ? "online" : ""} />
                {providerId === "codex" ? "GPT" : "Claude"}
              </button>
            );
          })}
        </div>
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
          <ToolStep label="drawing-index-agent" tool="cad.build_index" state="done" />
          <ToolStep
            label="search-agent"
            tool="cad.find_entities_by_layer"
            state={running ? "running" : completed ? "done" : "idle"}
          />
          <ToolStep
            label="evidence-agent"
            tool="verify handles + bbox"
            state={completed ? "done" : "idle"}
          />
        </div>

        {completed && (
          <div className="message agent-message response-message">
            <div className="message-label"><Check size={12} /> VERIFIED RESULT</div>
            <p><strong>4개 주요 객체</strong>를 확인했습니다. 모든 결과에 handle, type, layer, bbox가 연결되어 있습니다.</p>
          </div>
        )}

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

      <form className="composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <input
          aria-label="AI 질문"
          disabled={chatLoading}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder="도면에 대해 질문하세요…"
          value={message}
        />
        <div className="composer-actions">
          <span>
            <button aria-label="에이전트 멘션" type="button"><AtSign size={14} /></button>
            <button aria-label="파일 첨부" type="button"><Paperclip size={14} /></button>
          </span>
          <span className="composer-provider">{selectedProvider === "codex" ? "GPT" : "CLAUDE"} · OAUTH</span>
          <button className="send-button" aria-label="전송" disabled={chatLoading || !message.trim()}>
            {chatLoading ? <LoaderCircle className="spin" size={13} /> : <Send size={13} />}
          </button>
        </div>
      </form>
    </aside>
  );
}

function ToolStep({ label, tool, state }: { label: string; tool: string; state: "idle" | "running" | "done" }) {
  return (
    <div className={`tool-step ${state}`}>
      {state === "running" ? <LoaderCircle className="spin" size={14} /> : state === "done" ? <Check size={14} /> : <ChevronRight size={14} />}
      <div><strong>{label}</strong><span><TerminalSquare size={11} /> {tool}</span></div>
      <em>{state === "running" ? "RUNNING" : state === "done" ? "DONE" : "QUEUED"}</em>
    </div>
  );
}
