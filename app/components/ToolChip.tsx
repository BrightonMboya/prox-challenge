"use client";

import { Search, BookOpen, Sparkles, Wrench } from "lucide-react";

type Props = {
  tool: string;
  input: unknown;
  status: "running" | "done";
};

const TOOL_META: Record<
  string,
  { label: (input: any) => string; icon: typeof Search }
> = {
  "mcp__omnipro-manual__search_manual": {
    label: (i) => `Searching manual: "${i?.query ?? "..."}"`,
    icon: Search,
  },
  "mcp__omnipro-manual__show_page": {
    label: (i) => `Opening ${i?.doc ?? "?"} p.${i?.page ?? "?"}`,
    icon: BookOpen,
  },
  "mcp__omnipro-manual__render_artifact": {
    label: (i) => `Building artifact: ${i?.title ?? "..."}`,
    icon: Sparkles,
  },
};

export default function ToolChip({ tool, input, status }: Props) {
  const meta = TOOL_META[tool];
  const Icon = meta?.icon ?? Wrench;
  const label = meta?.label(input) ?? tool;
  return (
    <div className="my-2 flex items-center gap-2 text-xs text-[#9a9aa3]">
      <Icon size={13} className={status === "running" ? "animate-pulse text-[#ff6b35]" : "text-[#5a5a64]"} />
      <span className={status === "running" ? "text-[#c5c5cc]" : ""}>{label}</span>
      {status === "running" && <span className="pulse-dot" />}
    </div>
  );
}
