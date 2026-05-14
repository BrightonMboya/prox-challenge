"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent, ChatMessage, RichBlock } from "./types";
import AssistantMessage from "./components/AssistantMessage";
import UserMessage from "./components/UserMessage";
import Composer from "./components/Composer";

const SUGGESTIONS = [
  "What's the duty cycle for MIG welding at 200A on 240V?",
  "I'm getting porosity in my flux-cored welds. What should I check?",
  "Walk me through TIG polarity setup — which socket does the ground clamp go in?",
  "What process should I use for 1/4\" mild steel?",
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (busy) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      blocks: [{ kind: "text", text }],
      done: true,
    };
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      blocks: [],
      done: false,
    };

    const history = messages.map((m) => ({
      role: m.role,
      content: collapseBlocksToText(m.blocks),
    }));

    setMessages((m) => [...m, userMsg, assistantMsg]);
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const raw = await res.text().catch(() => "");
        let err = raw || "Request failed";
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error) err = parsed.error;
        } catch {}
        updateAssistant(assistantMsg.id, (m) => ({ ...m, done: true, error: err }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") {
            updateAssistant(assistantMsg.id, (m) => ({ ...m, done: true }));
            continue;
          }
          try {
            const event = JSON.parse(payload) as AgentEvent;
            applyEvent(assistantMsg.id, event);
          } catch (e) {
            console.error("parse error", e, payload);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== "AbortError" && !message.includes("aborted")) {
        updateAssistant(assistantMsg.id, (m) => ({ ...m, done: true, error: message }));
      } else {
        updateAssistant(assistantMsg.id, (m) => ({ ...m, done: true }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const updateAssistant = (id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((msgs) => msgs.map((m) => (m.id === id ? fn(m) : m)));
  };

  const applyEvent = (id: string, event: AgentEvent) => {
    setMessages((msgs) =>
      msgs.map((m) => {
        if (m.id !== id) return m;
        const blocks = [...m.blocks];
        switch (event.type) {
          case "text": {
            const last = blocks[blocks.length - 1];
            if (last && last.kind === "text") {
              blocks[blocks.length - 1] = { kind: "text", text: last.text + event.delta };
            } else {
              blocks.push({ kind: "text", text: event.delta });
            }
            break;
          }
          case "tool_start": {
            blocks.push({
              kind: "tool",
              tool: event.tool,
              input: event.input,
              id: event.id,
              status: "running",
            });
            break;
          }
          case "tool_end": {
            for (let i = blocks.length - 1; i >= 0; i--) {
              const b = blocks[i];
              if (b.kind === "tool" && b.id === event.id) {
                blocks[i] = { ...b, status: "done" };
                break;
              }
            }
            break;
          }
          case "page_shown": {
            blocks.push({
              kind: "page",
              doc: event.doc,
              page: event.page,
              reason: event.reason,
              image: event.image,
            });
            break;
          }
          case "artifact": {
            blocks.push({
              kind: "artifact",
              title: event.title,
              summary: event.summary,
              html: event.html,
            });
            break;
          }
          case "error": {
            return { ...m, blocks, done: true, error: event.message };
          }
          case "done": {
            return { ...m, blocks, done: true };
          }
        }
        return { ...m, blocks };
      }),
    );
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const showWelcome = messages.length === 0;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#26262d] px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-[#ff6b35] to-[#c84d1f] text-sm font-bold text-white">
            V
          </div>
          <div>
            <div className="text-sm font-semibold text-white">OmniPro Assistant</div>
            <div className="text-xs text-[#9a9aa3]">Vulcan OmniPro 220 · multimodal expert</div>
          </div>
        </div>
        <div className="text-xs text-[#5a5a64]">
          <span className="hidden sm:inline">Built on Claude Agent SDK · </span>
          <a
            className="hover:text-[#9a9aa3]"
            href="https://www.harborfreight.com/omnipro-220-industrial-multiprocess-welder-with-120240v-input-57812.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            product page ↗
          </a>
        </div>
      </header>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-6">
          {showWelcome ? (
            <Welcome onPick={(s) => send(s)} />
          ) : (
            <div className="flex flex-col gap-7">
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} content={collapseBlocksToText(m.blocks)} />
                ) : (
                  <AssistantMessage key={m.id} msg={m} />
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-[#26262d] bg-[#0a0a0b] px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-[760px]">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => send(input.trim())}
            onStop={stop}
            busy={busy}
          />
          <div className="mt-2 text-center text-[11px] text-[#5a5a64]">
            Grounded in the official Vulcan OmniPro 220 owner's manual, quick-start guide, and selection chart.
          </div>
        </div>
      </div>
    </div>
  );
}

function collapseBlocksToText(blocks: RichBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "text") return b.text;
      if (b.kind === "page") return `[Showed ${b.doc} p.${b.page}: ${b.reason}]`;
      if (b.kind === "artifact") return `[Rendered interactive artifact: ${b.title}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-8 pt-12">
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff6b35] to-[#c84d1f] text-2xl font-bold text-white shadow-lg shadow-[#ff6b35]/20">
          V
        </div>
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">
          OmniPro Welding Assistant
        </h1>
        <p className="mt-2 max-w-md text-sm text-[#9a9aa3]">
          Deep expertise on the Vulcan OmniPro 220 multiprocess welder. Ask about duty cycles, polarity setup, weld defects, settings — anything in the 48-page manual.
        </p>
      </div>
      <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-xl border border-[#26262d] bg-[#131316] px-4 py-3 text-left text-sm text-[#c5c5cc] transition hover:border-[#3a3a44] hover:bg-[#1a1a1f]"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
