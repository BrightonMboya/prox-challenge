"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

type Props = {
  title: string;
  summary: string;
  html: string;
};

export default function Artifact({ title, summary, html }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(420);

  useEffect(() => {
    const f = iframeRef.current;
    if (!f) return;
    f.srcdoc = html;
    const onLoad = () => {
      try {
        const doc = f.contentDocument;
        if (doc) {
          const h = Math.min(
            900,
            Math.max(280, doc.documentElement.scrollHeight + 16),
          );
          setHeight(h);
        }
      } catch {
        // cross-origin etc. — leave default height
      }
    };
    f.addEventListener("load", onLoad);
    return () => f.removeEventListener("load", onLoad);
  }, [html]);

  return (
    <div
      className={
        expanded
          ? "fixed inset-4 z-50 flex flex-col rounded-xl border border-[#26262d] bg-[#131316] shadow-2xl"
          : "my-3 overflow-hidden rounded-xl border border-[#26262d] bg-[#131316]"
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#26262d] bg-[#1a1a1f] px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-[#ff6b35]">
              Interactive
            </span>
            <span className="truncate text-sm font-medium text-white">
              {title}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-[#9a9aa3]">{summary}</p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md p-1.5 text-[#9a9aa3] transition hover:bg-[#26262d] hover:text-white"
          aria-label={expanded ? "Minimize" : "Maximize"}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        className="w-full bg-[#0a0a0b]"
        style={{ height: expanded ? "calc(100% - 49px)" : height }}
        title={title}
      />
    </div>
  );
}
