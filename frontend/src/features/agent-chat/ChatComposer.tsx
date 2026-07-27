import {
  AtSign,
  Paperclip,
  Send,
  Square,
  X
} from "lucide-react";
import { useRef, useState } from "react";

import type { ProviderId } from "../../shared/types";

interface Props {
  provider: ProviderId;
  message: string;
  loading: boolean;
  onMessageChange(message: string): void;
  onSubmit(): void;
  onCancel(): void;
}

export function ChatComposer({
  provider,
  message,
  loading,
  onMessageChange,
  onSubmit,
  onCancel
}: Props) {
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  function insertMention() {
    const separator = message && !message.endsWith(" ") ? " " : "";
    onMessageChange(`${message}${separator}@drawing-index-agent `);
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  }

  return (
    <form className="composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <input
        aria-label="AI 질문"
        disabled={loading}
        onChange={(event) => onMessageChange(event.target.value)}
        placeholder="도면에 대해 질문하세요…"
        ref={messageInputRef}
        value={message}
      />
      <input
        accept=".dwg,.dxf,.json,.txt"
        aria-label="첨부 파일 선택"
        className="visually-hidden"
        onChange={(event) => setAttachmentName(event.target.files?.[0]?.name ?? null)}
        ref={fileInputRef}
        type="file"
      />
      {attachmentName && (
        <span className="attachment-chip">
          <Paperclip size={11} />
          <span>{attachmentName}</span>
          <button aria-label="첨부 제거" onClick={() => {
            setAttachmentName(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }} type="button"><X size={11} /></button>
        </span>
      )}
      <div className="composer-actions">
        <span>
          <button aria-label="에이전트 멘션" onClick={insertMention} type="button"><AtSign size={14} /></button>
          <button aria-label="파일 첨부" onClick={() => fileInputRef.current?.click()} type="button"><Paperclip size={14} /></button>
        </span>
        <span className="composer-provider">{provider === "codex" ? "GPT" : "CLAUDE"} · OAUTH</span>
        {loading ? (
          <button
            className="send-button cancel-button"
            aria-label="응답 취소"
            onClick={onCancel}
            onPointerDown={(event) => {
              event.preventDefault();
              onCancel();
            }}
            type="button"
          >
            <Square size={11} />
          </button>
        ) : (
          <button className="send-button" aria-label="전송" disabled={!message.trim()}>
            <Send size={13} />
          </button>
        )}
      </div>
    </form>
  );
}
