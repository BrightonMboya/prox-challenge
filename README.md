# OmniPro Welding Assistant

A multimodal reasoning agent for the **Vulcan OmniPro 220** multiprocess welder. Built on the Claude Agent SDK for the Prox Founding Engineer Challenge.

<img src="product.webp" alt="Vulcan OmniPro 220" width="400" /> <img src="product-inside.webp" alt="Vulcan OmniPro 220 — inside panel" width="400" />

---

## Run it

```bash
git clone <this-repo>
cd prox-challenge
cp .env.example .env          # paste your Anthropic key into .env
npm install
npm run dev                   # → http://localhost:3000
```

That's it. The pre-processed manual index and page images are committed, so there is no separate build step.

Default model: `claude-sonnet-4-5`. Set `ANTHROPIC_MODEL=claude-opus-4-5` in `.env` for the strongest answers (slower, pricier).

---

## What it does

Ask it anything about the OmniPro 220 — duty cycles, polarity, weld defects, settings, schematic questions, parts. It will:

1. **Search the manual** to find relevant pages.
2. **Open the relevant page as an image** so it can read diagrams, charts, and labelled panels directly, then surface that same page to you inline in the chat.
3. **Generate an interactive artifact** (a duty cycle calculator, a troubleshooting flowchart, a settings recommender) when the question deserves more than text.
4. **Cite the page** so you can verify everything.

Try the four suggested prompts on the landing screen — each one exercises a different shape of multimodal response.

---

## Architecture

```
┌─────────────────┐   POST /api/chat   ┌──────────────────────┐
│  Next.js client │ ─────────────────▶ │  Next.js API route   │
│  (app/page.tsx) │                    │  (app/api/chat)      │
│                 │ ◀──── SSE ──────── │                      │
└─────────────────┘                    └──────────┬───────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────┐
                                       │  Claude Agent SDK    │
                                       │  query() w/ in-proc  │
                                       │  MCP server          │
                                       └──────────┬───────────┘
                                                  │
                                ┌─────────────────┼─────────────────┐
                                ▼                 ▼                 ▼
                          search_manual       show_page       render_artifact
                          (BM25 over the    (returns page    (sandboxed iframe
                           ingest index)    image to model    rendered in chat)
                                              + UI)
```

### The three custom MCP tools

| Tool | What it does | Why it matters |
|---|---|---|
| `search_manual(query)` | BM25 search across every page of every PDF. Returns ranked snippets with `doc/page` refs. | Lets the model navigate ~50 pages of dense technical content without having to read it all into context every turn. |
| `show_page(doc, page, reason)` | Reads a specific page from disk, returns it to the model **as an image** (so Claude *sees* the diagrams), and emits a sentinel that the streaming layer turns into an inline page reference in the user's chat. | This is the heart of multimodality. Tables, polarity diagrams, weld-defect photos, and the wiring schematic only exist as visual content — text extraction misses them entirely. |
| `render_artifact(title, summary, html)` | Streams a self-contained HTML document to the frontend, which renders it in a sandboxed iframe with `allow-scripts`. | Lets the model write interactive UI on the fly when text falls short — calculators, decision trees, configurators. |

The MCP server runs in-process via `createSdkMcpServer`. No subprocess, no separate transport.

### Streaming pipeline

The Agent SDK yields a mix of message types:
- `stream_event` → partial assistant deltas (token-by-token text, thinking, tool_use starts)
- `user` → tool results (where I pluck out artifact / page sentinels)
- `result` → terminal message with cost + usage

The API route serializes a small, frontend-tailored event union (`AgentEvent` in `lib/agent.ts`) over Server-Sent Events. The client reduces those events into rich block lists per message — so a single assistant turn might be `[text → tool chip → page image → text → artifact → text]` interleaved in render order.

### Knowledge extraction

`scripts/ingest.py` walks `files/`, and for every page of every PDF:
- extracts the text layer with PyMuPDF,
- renders the page at 150 DPI as JPEG (full size) + 60 DPI (thumbnail),
- writes everything into `public/manual/<doc>/page-NNN.jpg` and a single `lib/manual-index.json`.

The runtime never touches PDFs — only the JSON index (for search) and the JPEGs (for visual reasoning + UI display).

Design choice: rendered images at 150 DPI are sharp enough for Claude to read fine print, table cells, and small diagrams, while keeping the total bundle around 14 MB. The selection chart PDF has **zero extracted text** — it's a vector chart with text-as-paths — so it lives entirely as an image and the model reasons from that image when called.

### Why this stack

- **Next.js 16 / App Router** — one process serving both UI and API, single `npm run dev`, easy deploy story (Vercel out of the box).
- **Claude Agent SDK** — required by the brief, and a clean fit: the in-process MCP server lets all three tools live in one file, partial-message events give native streaming, and `permissionMode: bypassPermissions` + a tight `allowedTools` list keeps the agent locked to the three custom tools (no filesystem, no shell).
- **Tailwind 4** — fast, no per-component class soup.
- **No vector DB / no RAG embedding layer** — at this corpus size (50 pages, ~50k tokens of text) BM25 outperforms semantic search for the kind of literal welding-jargon questions users ask, and avoids a separate index dependency.

### Sandboxing artifacts

Each artifact lives in an `<iframe sandbox="allow-scripts">`. The HTML is written via `srcdoc`, so there is no parent-page DOM access, no cookies, no same-origin access, and no network outside what the agent inlines (the system prompt forbids it from inlining any external scripts). The artifact iframe auto-sizes to its content and supports a fullscreen toggle.

---

## Files of interest

```
files/                              # source PDFs (input to ingest)
scripts/ingest.py                   # PDF → JSON index + page JPEGs
public/manual/                      # rendered page JPEGs (committed)
lib/manual-index.json               # search corpus + page metadata (committed)
lib/manual.ts                       # search + page lookup helpers
lib/agent.ts                        # Agent SDK setup, MCP tools, event stream
app/api/chat/route.ts               # SSE endpoint
app/page.tsx                        # main chat UI
app/components/Artifact.tsx         # sandboxed iframe renderer
app/components/PageReference.tsx    # inline manual page card
app/components/AssistantMessage.tsx # block-list renderer
```

---

## Re-running the ingest

Only necessary if the PDFs in `files/` change.

```bash
python3 -m venv .venv
.venv/bin/pip install pymupdf
.venv/bin/python scripts/ingest.py
```

Outputs are deterministic and committed to git.

---

## What I'd build next

A few directions that fell outside the time budget:

- **Voice in/out.** The brief explicitly invites it, and a hands-busy welder talking to their welder is the right use case. Web Speech API in, ElevenLabs out.
- **Persistent session memory.** Right now each request is a fresh agent run with the transcript replayed; switching to the Agent SDK's `unstable_v2_createSession` would cut input tokens dramatically on long chats.
- **Per-page region cropping.** When the agent only needs the duty-cycle table on p. 19, sending the full page wastes vision tokens. A `show_region(doc, page, bbox)` tool would shrink the visual context window meaningfully.
- **Artifact library.** Once the agent has produced a duty-cycle calculator once, cache and reuse it across sessions instead of regenerating.
- **Eval harness.** A small set of gold-standard questions (the three in the brief, plus 10–20 more I'd write by hand-reading the manual) scored automatically against expected page citations.

---

Built by Brighton Mboya for the [Prox](https://useprox.com) Founding Engineer Challenge.
