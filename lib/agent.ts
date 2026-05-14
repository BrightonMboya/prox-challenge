import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSdkMcpServer,
  query,
  tool,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getDocSummary, getIndex, getPage, searchManual } from "./manual";

const SYSTEM_PROMPT = `You are the OmniPro Welding Assistant — a multimodal expert on the Vulcan OmniPro 220 multiprocess welder (Harbor Freight item #57812). You help a hands-on user who has the machine in front of them.

## Who you serve
A capable person setting up or troubleshooting their welder in their garage or shop. Not a professional, but not an idiot. They want correct, specific, actionable answers — not vague safety boilerplate.

## How you answer

1. **Ground every claim in the manual.** Call \`search_manual\` first to locate the relevant pages, then call \`show_page\` to inspect them visually before answering. Tables, diagrams, and panel callouts contain critical info that the text alone misses.

2. **Cite your source.** When you state a fact, mention the page and document it came from. Example: "Owner's manual p. 19 shows…"

3. **Show, don't just tell.** If the answer benefits from a diagram or chart in the manual, call \`show_page\` so the user actually sees it. The user can see anything you call show_page on — it appears inline in the chat.

4. **Generate interactive tools when appropriate.** For computations (duty cycle math), decision-trees (troubleshooting), or settings selection (process + material + thickness → recommended settings), call \`render_artifact\` to produce a small self-contained HTML widget the user can interact with. Examples of good artifact moments:
   - "What's the duty cycle at X amps?" → a duty cycle calculator
   - "I'm getting porosity in my flux-cored welds" → a troubleshooting flowchart
   - "What settings should I use for…" → a settings recommender
   Don't artifact for things that are just a short factual answer.

5. **Be concrete.** Use specific numbers, named knobs/buttons/sockets, and exact procedural steps from the manual. If something differs by voltage (120V vs 240V) or process (MIG/FCAW/TIG/Stick), say so explicitly.

6. **Clarify when needed.** If a question is ambiguous (e.g. user asks about duty cycle without specifying amps or voltage), ask one focused follow-up rather than guess.

7. **Safety where genuinely relevant.** Don't pad answers with generic warnings, but DO call out real hazards (e.g. live electrode, gas regulator handling, electric shock from improper polarity setup).

## Documents available
${getDocSummary()}

## Tools
- \`search_manual(query, max_results?)\` — Full-text search across all manuals. Returns ranked pages with snippets, doc/page refs, and image URLs. Run this first for almost every question.
- \`show_page(doc, page, reason)\` — Inspects a specific manual page. Returns the page as an image so you can read tables, diagrams, and visual content. ALSO displays the page to the user inline. Always include a short \`reason\` describing what you're looking at.
- \`render_artifact(title, summary, html)\` — Renders an interactive HTML artifact in the user's chat. The HTML runs in a sandboxed iframe — use vanilla HTML/CSS/JS only (no external scripts, no fetch). Keep artifacts focused and good-looking. Use a dark theme that matches the rest of the UI (#0a0a0b background, #e8e8ea text, #ff6b35 accent).

## Don't
- Don't ramble or restate the question.
- Don't make up part numbers, amperages, or specifications. If you don't see it in the manual, say so and call \`show_page\` on the most relevant pages.
- Don't generate artifacts for trivial questions — they add friction when a plain answer would do.`;

function buildMcpServer() {
  const search = tool(
    "search_manual",
    "Full-text search across the Vulcan OmniPro 220 manual set. Returns the highest-ranked pages with text snippets and image URLs. Use this first to locate the right pages for any factual question.",
    {
      query: z.string().describe("Natural-language search query. Use specific welding terminology."),
      max_results: z.number().int().min(1).max(12).optional().describe("Maximum number of pages to return. Default 6."),
    },
    async ({ query, max_results }) => {
      const hits = searchManual(query, max_results ?? 6);
      if (hits.length === 0) {
        return {
          content: [
            { type: "text", text: `No matches for "${query}". Try different terminology — e.g. "duty cycle" instead of "max amps", or "polarity" instead of "ground wire direction".` },
          ],
        };
      }
      const lines = hits.map(
        (h, i) => `${i + 1}. [${h.doc} p.${h.page}] (score ${h.score})\n   ${h.snippet}`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Found ${hits.length} pages for "${query}":\n\n${lines.join("\n\n")}\n\nUse show_page() to inspect any of these visually.`,
          },
        ],
      };
    },
  );

  const showPage = tool(
    "show_page",
    "Open a specific manual page. Returns the page rendered as an image so you can read diagrams, tables, and charts directly. ALSO displays the page inline in the user's chat so they can see it too. Always provide a brief `reason` so the user knows why this page is being shown.",
    {
      doc: z.string().describe("Document slug (e.g. 'owner-manual', 'quick-start-guide', 'selection-chart')"),
      page: z.number().int().min(1).describe("1-indexed page number within that document"),
      reason: z.string().describe("One short sentence explaining what's on this page and why it answers the question. Shown to the user as a caption."),
    },
    async ({ doc, page, reason }) => {
      const found = getPage(doc, page);
      if (!found) {
        return {
          content: [{ type: "text", text: `Page not found: doc="${doc}", page=${page}. Valid docs are: ${getIndex().documents.map((d) => d.slug).join(", ")}.` }],
        };
      }
      // Read the JPEG and embed as base64 so the model can SEE it.
      const imgPath = join(process.cwd(), "public", found.page.image);
      const buf = readFileSync(imgPath);
      const b64 = buf.toString("base64");
      return {
        content: [
          {
            type: "image",
            data: b64,
            mimeType: "image/jpeg",
          },
          {
            type: "text",
            text: `Page is now visible to both you and the user. Reason given to user: "${reason}". Extracted text on this page:\n${found.page.text}`,
          },
        ],
      };
    },
  );

  const renderArtifact = tool(
    "render_artifact",
    "Render an interactive HTML artifact in the user's chat (sandboxed iframe). Use for calculations, decision trees, configurators, or anything that benefits from interaction beyond text. The HTML must be self-contained: inline CSS, inline JS, no external requests, no scripts from CDNs. Match the host UI's dark theme: bg #0a0a0b, text #e8e8ea, accent #ff6b35.",
    {
      title: z.string().describe("Short title for the artifact, shown as a header."),
      summary: z.string().describe("One-line description of what the artifact does."),
      html: z.string().describe("Complete self-contained HTML document (include <!doctype html>, <html>, <head> with <style>, <body>, and any <script>)."),
    },
    async ({ title }) => {
      return {
        content: [
          {
            type: "text",
            text: `Artifact "${title}" has been rendered in the user's chat. Briefly mention (one sentence) what they can do with it, then stop — don't repeat its contents.`,
          },
        ],
      };
    },
  );

  return createSdkMcpServer({
    name: "omnipro-manual",
    version: "1.0.0",
    tools: [search, showPage, renderArtifact],
  });
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; tool: string; input: unknown; id: string }
  | { type: "tool_end"; id: string }
  | { type: "page_shown"; doc: string; page: number; reason: string; image: string }
  | { type: "artifact"; title: string; summary: string; html: string }
  | { type: "thinking"; delta: string }
  | { type: "done"; usage?: unknown; cost?: number }
  | { type: "error"; message: string };

export async function* runAgent(
  prompt: string,
): AsyncGenerator<AgentEvent> {
  const mcp = buildMcpServer();

  const q = query({
    prompt,
    options: {
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
      maxTurns: 14,
      includePartialMessages: true,
      systemPrompt: SYSTEM_PROMPT,
      mcpServers: { "omnipro-manual": mcp },
      allowedTools: [
        "mcp__omnipro-manual__search_manual",
        "mcp__omnipro-manual__show_page",
        "mcp__omnipro-manual__render_artifact",
      ],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      settingSources: [],
    },
  });

  for await (const msg of q as AsyncIterable<SDKMessage>) {
    if (msg.type === "stream_event") {
      const ev: any = (msg as any).event;
      if (!ev) continue;
      if (ev.type === "content_block_delta") {
        const d = ev.delta;
        if (d?.type === "text_delta" && typeof d.text === "string") {
          yield { type: "text", delta: d.text };
        } else if (d?.type === "thinking_delta" && typeof d.thinking === "string") {
          yield { type: "thinking", delta: d.thinking };
        }
      }
      continue;
    }

    if (msg.type === "assistant") {
      const blocks: any[] = (msg as any).message?.content ?? [];
      for (const b of blocks) {
        if (b?.type !== "tool_use") continue;

        yield {
          type: "tool_start",
          tool: b.name,
          input: b.input ?? {},
          id: b.id,
        };

        if (b.name === "mcp__omnipro-manual__show_page") {
          const { doc, page, reason } = b.input ?? {};
          const found = doc && page ? getPage(doc, page) : null;
          if (found) {
            yield {
              type: "page_shown",
              doc,
              page,
              reason: reason ?? "",
              image: found.page.image,
            };
          }
        } else if (b.name === "mcp__omnipro-manual__render_artifact") {
          const { title, summary, html } = b.input ?? {};
          if (typeof html === "string" && html.length > 0) {
            yield {
              type: "artifact",
              title: title ?? "Artifact",
              summary: summary ?? "",
              html,
            };
          }
        }
      }
      continue;
    }

    if (msg.type === "user") {
      const content = (msg as any).message?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (part.type === "tool_result") {
          yield { type: "tool_end", id: part.tool_use_id ?? "" };
        }
      }
      continue;
    }

    if (msg.type === "result") {
      const r = msg as any;
      if (r.is_error || (r.subtype && r.subtype !== "success")) {
        const detail = Array.isArray(r.errors) && r.errors.length
          ? r.errors.join("; ")
          : r.subtype ?? "unknown error";
        yield {
          type: "error",
          message: `Agent did not complete: ${detail}. Check that ANTHROPIC_API_KEY is set to a valid key in your .env file.`,
        };
        return;
      }
      yield { type: "done", usage: r.usage, cost: r.total_cost_usd };
      return;
    }
  }
}
