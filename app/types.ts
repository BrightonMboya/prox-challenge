export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; tool: string; input: unknown; id: string }
  | { type: "tool_end"; id: string }
  | { type: "page_shown"; doc: string; page: number; reason: string; image: string }
  | { type: "artifact"; title: string; summary: string; html: string }
  | { type: "thinking"; delta: string }
  | { type: "done"; usage?: unknown; cost?: number }
  | { type: "error"; message: string };

export type RichBlock =
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: string; input: unknown; id: string; status: "running" | "done" }
  | { kind: "page"; doc: string; page: number; reason: string; image: string }
  | { kind: "artifact"; title: string; summary: string; html: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  blocks: RichBlock[];
  done: boolean;
  error?: string;
};
