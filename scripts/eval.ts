#!/usr/bin/env tsx
/**
 * OmniPro Assistant eval harness.
 *
 * Runs a set of seed questions through the agent and scores them on two axes:
 *   1. Page citation — did the agent open at least one of the expected manual
 *      pages via show_page()?
 *   2. Text content — did the final reply contain at least one of the
 *      expected substrings?
 *
 * A question is a PASS if both checks succeed, FAIL otherwise. Failures are
 * printed with details so they're easy to debug.
 *
 * Usage:
 *   tsx scripts/eval.ts                # run all questions
 *   tsx scripts/eval.ts duty-cycle     # run questions whose id matches
 *   ANTHROPIC_MODEL=claude-opus-4-5 tsx scripts/eval.ts   # override model
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config as dotenv } from "dotenv";
import { runAgent } from "../lib/agent";

dotenv({ path: join(process.cwd(), ".env"), quiet: true });

type ExpectedPage = { doc: string; pages: number[] };
type Question = {
  id: string;
  question: string;
  expected_pages: ExpectedPage[];
  expected_text_any: string[];
};

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";

async function runOne(q: Question): Promise<{
  pass: boolean;
  pagesShown: { doc: string; page: number }[];
  citationHit: boolean;
  textHit: boolean;
  matchedText: string | null;
  reply: string;
  ms: number;
}> {
  const pagesShown: { doc: string; page: number }[] = [];
  let reply = "";
  const t0 = Date.now();

  for await (const ev of runAgent(q.question)) {
    if (ev.type === "page_shown") {
      pagesShown.push({ doc: ev.doc, page: ev.page });
    } else if (ev.type === "text") {
      reply += ev.delta;
    } else if (ev.type === "error") {
      throw new Error(ev.message);
    }
  }

  const ms = Date.now() - t0;

  const citationHit = q.expected_pages.some((ep) =>
    pagesShown.some((p) => p.doc === ep.doc && ep.pages.includes(p.page)),
  );

  const replyLower = reply.toLowerCase();
  const matchedText = q.expected_text_any.find((t) => replyLower.includes(t.toLowerCase())) ?? null;
  const textHit = matchedText !== null;

  return {
    pass: citationHit && textHit,
    pagesShown,
    citationHit,
    textHit,
    matchedText,
    reply,
    ms,
  };
}

function formatExpected(expected: ExpectedPage[]): string {
  return expected.map((e) => `${e.doc} p.${e.pages.join(",")}`).join(" or ");
}

async function main() {
  const filter = process.argv[2]?.toLowerCase();
  const raw = readFileSync(join(process.cwd(), "scripts", "eval-questions.json"), "utf8");
  const all: Question[] = JSON.parse(raw).questions;
  const questions = filter ? all.filter((q) => q.id.includes(filter)) : all;

  if (questions.length === 0) {
    console.log(`No questions match filter "${filter}". Available IDs:`);
    for (const q of all) console.log(`  - ${q.id}`);
    process.exit(1);
  }

  console.log(`${BOLD}Running ${questions.length} eval question${questions.length === 1 ? "" : "s"}...${RESET}`);
  console.log(`${DIM}Model: ${process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5"}${RESET}\n`);

  let pass = 0;
  let fail = 0;
  const failures: { q: Question; result: Awaited<ReturnType<typeof runOne>> }[] = [];

  for (const q of questions) {
    process.stdout.write(`${DIM}[${q.id}]${RESET} ${q.question}\n`);
    try {
      const r = await runOne(q);
      const status = r.pass
        ? `${GREEN}✓ PASS${RESET}`
        : `${RED}✗ FAIL${RESET}`;
      const pages = r.pagesShown.length
        ? r.pagesShown.map((p) => `${p.doc} p.${p.page}`).join(", ")
        : `${DIM}(none)${RESET}`;
      console.log(`  ${status}  ${DIM}${(r.ms / 1000).toFixed(1)}s${RESET}`);
      console.log(`  ${BLUE}cited${RESET}     ${pages}`);
      console.log(`  ${BLUE}expected${RESET}  ${formatExpected(q.expected_pages)}`);
      console.log(`  ${BLUE}citation${RESET}  ${r.citationHit ? GREEN + "✓" : RED + "✗"}${RESET}   ${BLUE}text-match${RESET}  ${r.textHit ? GREEN + `✓ "${r.matchedText}"` : RED + "✗"}${RESET}`);
      console.log();
      if (r.pass) pass++;
      else {
        fail++;
        failures.push({ q, result: r });
      }
    } catch (e) {
      fail++;
      console.log(`  ${RED}✗ ERROR${RESET}  ${e instanceof Error ? e.message : String(e)}`);
      console.log();
    }
  }

  const total = pass + fail;
  const pct = total ? Math.round((pass / total) * 100) : 0;
  const color = pct === 100 ? GREEN : pct >= 60 ? YELLOW : RED;
  console.log(`${BOLD}${color}━━━ ${pass}/${total} passed (${pct}%) ━━━${RESET}`);

  if (failures.length > 0) {
    console.log(`\n${BOLD}Failure details:${RESET}`);
    for (const { q, result } of failures) {
      console.log(`\n${RED}[${q.id}]${RESET}`);
      console.log(`  Reply preview: ${DIM}${result.reply.slice(0, 240).replace(/\n/g, " ")}…${RESET}`);
    }
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
