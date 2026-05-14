"use client";

import { AlertCircle, ArrowUp, Mic, MicOff, Square, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSpeechRecognition } from "./useSpeech";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
};

export default function Composer({ value, onChange, onSubmit, onStop, busy }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const stt = useSpeechRecognition((finalText) => {
    onChange(value ? `${value} ${finalText}` : finalText);
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(220, el.scrollHeight) + "px";
  }, [value, stt.interim]);

  const displayValue =
    stt.listening && stt.interim
      ? value
        ? `${value} ${stt.interim}`
        : stt.interim
      : value;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && value.trim()) {
          stt.stop();
          onSubmit();
        }
      }}
      className="relative w-full"
    >
      {stt.error && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          <AlertCircle size={14} className="mt-0.5 flex-none" />
          <span className="flex-1">{stt.error}</span>
          <button
            type="button"
            onClick={stt.dismissError}
            className="flex-none text-red-300/70 hover:text-red-200"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded-2xl border bg-[#131316] px-3 py-2.5 transition ${
          stt.listening ? "border-[#ff6b35]" : "border-[#26262d] focus-within:border-[#3a3a44]"
        }`}
      >
        <textarea
          ref={ref}
          value={displayValue}
          onChange={(e) => {
            if (stt.listening) return;
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!busy && value.trim()) {
                stt.stop();
                onSubmit();
              }
            }
          }}
          rows={1}
          placeholder={stt.listening ? "Listening…" : "Ask anything about your Vulcan OmniPro 220…"}
          className="max-h-[220px] flex-1 resize-none bg-transparent text-[15px] text-white placeholder:text-[#5a5a64] focus:outline-none"
        />

        <button
          type="button"
          onClick={() => (stt.listening ? stt.stop() : stt.start())}
          disabled={!stt.supported}
          className={`flex h-8 w-8 flex-none items-center justify-center rounded-full transition ${
            stt.listening
              ? "bg-[#ff6b35] text-white"
              : "bg-[#1a1a1f] text-[#9a9aa3] hover:bg-[#26262d] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#1a1a1f] disabled:hover:text-[#9a9aa3]"
          }`}
          aria-label={
            !stt.supported
              ? stt.unsupportedReason ?? "Voice input not supported"
              : stt.listening
                ? "Stop listening"
                : "Start voice input"
          }
          title={
            !stt.supported
              ? stt.unsupportedReason ?? "Voice input not supported"
              : stt.listening
                ? "Stop listening"
                : "Voice input"
          }
        >
          {stt.listening ? <MicOff size={14} /> : <Mic size={14} />}
        </button>

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
