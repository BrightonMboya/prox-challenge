import { NextRequest } from "next/server";
import { runAgent, type AgentEvent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

function buildPrompt(history: ClientMessage[], userMessage: string): string {
  // Stateless multi-turn: encode prior turns as a transcript ahead of the
  // current question. Each new request is a fresh agent run, but the model
  // sees the conversation context and any tool results we surfaced as text.
  if (history.length === 0) return userMessage;

  const transcript = history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  return `[Previous conversation in this chat — for context only, do NOT re-answer earlier turns]\n\n${transcript}\n\n[Current question — answer this]\n\n${userMessage}`;
}

export async function POST(req: NextRequest) {
  // Auth: prefer ANTHROPIC_API_KEY if present. If not set, the Agent SDK
  // falls back to the Claude Code OAuth session on this machine, which
  // means a logged-in Max/Pro user can run the agent without an API key
  // (usage counts against their subscription quota, not API billing).
  const key = process.env.ANTHROPIC_API_KEY;
  const hasPlaceholderKey =
    key === "your-api-key-here" || (typeof key === "string" && key.length > 0 && key.length < 20);
  if (hasPlaceholderKey) {
    return new Response(
      JSON.stringify({
        error:
          "ANTHROPIC_API_KEY looks like a placeholder. Either paste a real key into .env or remove the line entirely to fall back to your Claude Code subscription login.",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  let body: { message: string; history: ClientMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  if (!body?.message || typeof body.message !== "string") {
    return new Response(JSON.stringify({ error: "message required" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const prompt = buildPrompt(body.history ?? [], body.message);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        for await (const ev of runAgent(prompt)) {
          send(ev);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[agent] error", err);
        send({ type: "error", message });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
