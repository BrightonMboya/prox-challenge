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

**Auth note:** if you have Claude Code installed and logged in (Pro/Max subscription), you can omit the `ANTHROPIC_API_KEY` line entirely — the Agent SDK will fall back to your Claude Code OAuth session and the usage will count against your subscription instead of API billing.

---

## What it does

Ask it anything about the OmniPro 220 — duty cycles, polarity, weld defects, settings, schematic questions, parts. It will:

1. **Search the manual** to find relevant pages.
2. **Open the relevant page as an image** so it can read diagrams, charts, and labelled panels directly, then surface that same page to you inline in the chat.
3. **Generate an interactive artifact** (a duty cycle calculator, a troubleshooting flowchart, a settings recommender) when the question deserves more than text.
4. **Cite the page** so you can verify everything.

Try the four suggested prompts on the landing screen — each one exercises a different shape of multimodal response.

**Voice mode.** Click the microphone in the composer to dictate a question; click the speaker chip in the header to have replies read aloud. Both use the browser's built-in Web Speech API, so they cost nothing and add zero dependencies.

> **STT browser caveat.** The mic uses `SpeechRecognition`, which on Chromium-based browsers routes audio through Google's cloud speech service. That works in **Chrome, Edge, and Safari**.
>
> The trade-off: I chose Web Speech API over a paid STT (Whisper, Deepgram) because the brief asks for a one-API-key install, and dragging in a second key for a nice-to-have feature wasn't worth the reviewer friction. The "What I'd build next" section calls this out as a known limitation.

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
npm run ingest
```

Outputs are deterministic and committed to git.

---

## Eval harness

A small CLI for regression-testing the agent against a seed set of questions with known-good page citations and text expectations.

```bash
npm run eval                  # run all questions
npm run eval -- duty-cycle    # run questions whose id contains "duty-cycle"
```

Each question passes if (a) the agent surfaced at least one expected manual page via `show_page`, and (b) the final reply contains at least one expected substring. The seed set lives in `scripts/eval-questions.json` — extend it.

The harness has already been useful: the first run caught that my hand-written `expected_pages` were grep-based guesses, while the actual duty-cycle table lives image-only on pages the text grep didn't see. The gold set is meant to be iteratively tightened against real agent runs.

---

## What I'd build next

Honest accounting of what was scoped out, with the cost/value reasoning:

- **Persistent session memory.** The Agent SDK has `unstable_v2_createSession`, but it's explicitly marked unstable — wiring it in risks the API changing between submission and review. Token savings only materialize on long chats; for one-shot eval questions the win is marginal. Worth doing once the API stabilizes.
- **Per-page region cropping.** When the agent only needs the duty-cycle table on p. 16, sending the full page wastes vision tokens. A `show_region(doc, page, bbox)` tool would shrink the visual context window — but needs either bbox detection at ingest time (real engineering) or model-specified bboxes at runtime (extra round-trip). The full-page approach already gives strong answers, so this is a speculative optimization.
- **Artifact library.** Cache produced artifacts so the duty-cycle calculator isn't regenerated every session. Needs session identity + content-addressed storage. First generation isn't slow enough to feel painful, so I parked it.
- **Better-quality eval gold set.** The seed set in `scripts/eval-questions.json` covers the three brief questions plus two more. Production-grade would be 20+ questions hand-curated from a careful read of the full manual, with multi-page expected citations and a notion of partial credit.
- **TTS via ElevenLabs.** Browser SpeechSynthesis is fine but synthetic-sounding. ElevenLabs would give a much warmer voice — at the cost of another API key, $/character billing, and reviewer setup friction. Not worth it for a demo.
- **Reliable STT across all browsers.** The current mic uses Web Speech API, which fails on Brave (no Google service) and Firefox (API not implemented). A real fix means swapping to MediaRecorder + a server-side Whisper/Deepgram call — which adds a second API key and meaningful audio-handling code. Worth it for a real product; not for a demo where the user can just open Chrome.

---

Built by Brighton Mboya for the [Prox](https://useprox.com) Founding Engineer Challenge.
