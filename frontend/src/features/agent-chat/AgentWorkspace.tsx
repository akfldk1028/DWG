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

import { agents } from "../../shared/agents";
import type { Scenario } from "../../shared/types";

interface Props {
  scenario: Scenario;
}

export function AgentWorkspace({ scenario }: Props) {
  const running = scenario === "running";
  const completed = scenario === "highlighted" || scenario === "finding" || scenario === "warning";

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
          <span>@export_sample.dwg · 7 agents</span>
        </div>
        <span className="context-status">LOCAL</span>
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

      <div className="composer">
        <div className="composer-placeholder">도면에 대해 질문하세요…</div>
        <div className="composer-actions">
          <span><button aria-label="에이전트 멘션"><AtSign size={14} /></button><button aria-label="파일 첨부"><Paperclip size={14} /></button></span>
          <button className="send-button" aria-label="전송"><Send size={13} /></button>
        </div>
      </div>
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
