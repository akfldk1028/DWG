import {
  AtSign,
  LoaderCircle,
  Paperclip,
  Send
} from "lucide-react";

import type { ProviderId } from "../../shared/types";

interface Props {
  provider: ProviderId;
  message: string;
  loading: boolean;
  onMessageChange(message: string): void;
  onSubmit(): void;
}

export function ChatComposer({
  provider,
  message,
  loading,
  onMessageChange,
  onSubmit
}: Props) {
  return (
    <form className="composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <input
        aria-label="AI 질문"
        disabled={loading}
        onChange={(event) => onMessageChange(event.target.value)}
        placeholder="도면에 대해 질문하세요…"
        value={message}
      />
      <div className="composer-actions">
        <span>
          <button aria-label="에이전트 멘션" type="button"><AtSign size={14} /></button>
          <button aria-label="파일 첨부" type="button"><Paperclip size={14} /></button>
        </span>
        <span className="composer-provider">{provider === "codex" ? "GPT" : "CLAUDE"} · OAUTH</span>
        <button className="send-button" aria-label="전송" disabled={loading || !message.trim()}>
          {loading ? <LoaderCircle className="spin" size={13} /> : <Send size={13} />}
        </button>
      </div>
    </form>
  );
}
