"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, RichBlock } from "../types";
import PageReference from "./PageReference";
import Artifact from "./Artifact";
import ToolChip from "./ToolChip";

export default function AssistantMessage({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#ff6b35] to-[#c84d1f] text-xs font-bold text-white">
        V
      </div>
      <div className="min-w-0 flex-1">
        {msg.blocks.map((b, i) => (
          <BlockRender key={i} block={b} />
        ))}
        {!msg.done && msg.blocks.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-[#9a9aa3]">
            <span className="pulse-dot" />
            <span>Thinking…</span>
          </div>
        )}
        {msg.error && (
          <div className="mt-2 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {msg.error}
          </div>
        )}
      </div>
    </div>
  );
}

function BlockRender({ block }: { block: RichBlock }) {
  if (block.kind === "text") {
    if (!block.text.trim()) return null;
    return (
      <div className="prose-welder text-[15px]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
      </div>
    );
  }
  if (block.kind === "tool") {
    return <ToolChip tool={block.tool} input={block.input} status={block.status} />;
  }
  if (block.kind === "page") {
    return <PageReference {...block} />;
  }
  if (block.kind === "artifact") {
    return <Artifact {...block} />;
  }
  return null;
}
