"use client";

import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
};

export default function Composer({ value, onChange, onSubmit, onStop, busy }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(220, el.scrollHeight) + "px";
  }, [value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && value.trim()) onSubmit();
      }}
      className="relative w-full"
    >
      <div className="flex items-end gap-2 rounded-2xl border border-[#26262d] bg-[#131316] px-3 py-2.5 transition focus-within:border-[#3a3a44]">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!busy && value.trim()) onSubmit();
            }
          }}
          rows={1}
          placeholder="Ask anything about your Vulcan OmniPro 220…"
          className="max-h-[220px] flex-1 resize-none bg-transparent text-[15px] text-white placeholder:text-[#5a5a64] focus:outline-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-black transition hover:bg-[#d8d8da]"
            aria-label="Stop"
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#ff6b35] text-white transition hover:bg-[#ff7e4d] disabled:bg-[#26262d] disabled:text-[#5a5a64]"
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </form>
  );
}
