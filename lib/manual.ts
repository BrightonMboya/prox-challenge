import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ManualPage = {
  page: number;
  text: string;
  image: string;
  thumb: string;
  width: number;
  height: number;
};

export type ManualDoc = {
  slug: string;
  title: string;
  source_file: string;
  num_pages: number;
  toc: { level: number; title: string; page: number }[];
  pages: ManualPage[];
};

export type ManualIndex = {
  product: {
    name: string;
    manufacturer: string;
    summary: string;
    photos: { path: string; caption: string }[];
  };
  documents: ManualDoc[];
};

let _cache: ManualIndex | null = null;

export function getIndex(): ManualIndex {
  if (_cache) return _cache;
  const raw = readFileSync(join(process.cwd(), "lib", "manual-index.json"), "utf8");
  _cache = JSON.parse(raw) as ManualIndex;
  return _cache;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in", "on",
  "for", "with", "as", "is", "are", "was", "were", "be", "been", "being", "by",
  "at", "from", "this", "that", "these", "those", "it", "its", "i", "you", "we",
  "they", "he", "she", "your", "my", "our", "their", "what", "which", "who",
  "how", "why", "when", "where", "do", "does", "did", "can", "could", "should",
  "would", "will", "shall", "may", "might", "must", "have", "has", "had",
  "not", "no", "so", "than", "too", "very", "s",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

type SearchHit = {
  doc: string;
  doc_title: string;
  page: number;
  score: number;
  image: string;
  snippet: string;
};

// Lightweight BM25-style scorer over per-page documents.
export function searchManual(query: string, maxResults = 6): SearchHit[] {
  const idx = getIndex();
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  type Pageref = { doc: ManualDoc; page: ManualPage; tokens: string[] };
  const corpus: Pageref[] = [];
  for (const d of idx.documents) {
    for (const p of d.pages) {
      corpus.push({ doc: d, page: p, tokens: tokenize(p.text) });
    }
  }

  const N = corpus.length;
  const avgLen = corpus.reduce((s, p) => s + p.tokens.length, 0) / Math.max(N, 1);
  const df = new Map<string, number>();
  for (const t of new Set(queryTokens)) {
    let c = 0;
    for (const p of corpus) if (p.tokens.includes(t)) c++;
    df.set(t, c);
  }
  const k1 = 1.4;
  const b = 0.7;

  const scored = corpus.map((p) => {
    const tf = new Map<string, number>();
    for (const tok of p.tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
    let score = 0;
    for (const qt of queryTokens) {
      const f = tf.get(qt) ?? 0;
      if (f === 0) continue;
      const dfV = df.get(qt) ?? 0;
      const idf = Math.log(1 + (N - dfV + 0.5) / (dfV + 0.5));
      const len = p.tokens.length;
      const norm = (f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / avgLen));
      score += idf * norm;
    }
    // Boost for exact phrase
    if (p.page.text.toLowerCase().includes(query.toLowerCase())) score += 2.5;
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((s) => s.score > 0)
    .slice(0, maxResults)
    .map(({ p, score }) => ({
      doc: p.doc.slug,
      doc_title: p.doc.title,
      page: p.page.page,
      score: Math.round(score * 100) / 100,
      image: p.page.image,
      snippet: makeSnippet(p.page.text, queryTokens),
    }));
}

function makeSnippet(text: string, tokens: string[]): string {
  const lower = text.toLowerCase();
  let bestIdx = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (bestIdx === -1 || i < bestIdx)) bestIdx = i;
  }
  if (bestIdx === -1) bestIdx = 0;
  const start = Math.max(0, bestIdx - 120);
  const end = Math.min(text.length, bestIdx + 360);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + slice + (end < text.length ? "…" : "");
}

export function getPage(docSlug: string, pageNum: number): { doc: ManualDoc; page: ManualPage } | null {
  const idx = getIndex();
  const doc = idx.documents.find((d) => d.slug === docSlug);
  if (!doc) return null;
  const page = doc.pages.find((p) => p.page === pageNum);
  if (!page) return null;
  return { doc, page };
}

export function getDocSummary(): string {
  const idx = getIndex();
  return idx.documents
    .map((d) => `- ${d.slug} ("${d.title}"): ${d.num_pages} pages`)
    .join("\n");
}
