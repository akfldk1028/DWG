import {
  AtSign,
  Paperclip,
  Send,
  Square,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const [attachmentBlock, setAttachmentBlock] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!message && attachmentName) {
      setAttachmentName(null);
      setAttachmentBlock("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [attachmentName, message]);

  function insertMention() {
    const separator = message && !message.endsWith(" ") ? " " : "";
    onMessageChange(`${message}${separator}@drawing-index-agent `);
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  }

  async function attachFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    const clippedContent = content.slice(0, 12_000);
    const block = `\n\n[첨부: ${file.name}]\n${clippedContent}${content.length > clippedContent.length ? "\n[내용 일부 생략]" : ""}`;
    const messageWithoutPreviousAttachment = attachmentBlock
      ? message.replace(attachmentBlock, "")
      : message;
    setAttachmentName(file.name);
    setAttachmentBlock(block);
    onMessageChange(`${messageWithoutPreviousAttachment.trimEnd()}${block}`);
  }

  function removeAttachment() {
    onMessageChange(message.replace(attachmentBlock, "").trimEnd());
    setAttachmentName(null);
    setAttachmentBlock("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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
        accept=".dxf,.json,.txt"
        aria-label="첨부 파일 선택"
        hidden
        onChange={(event) => void attachFile(event.target.files?.[0])}
        ref={fileInputRef}
        type="file"
      />
      {attachmentName && (
        <span className="attachment-chip">
          <Paperclip size={11} />
          <span>{attachmentName}</span>
          <button aria-label="첨부 제거" onClick={removeAttachment} type="button"><X size={11} /></button>
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
