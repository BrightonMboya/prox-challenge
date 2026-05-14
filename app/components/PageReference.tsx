"use client";

import { useState } from "react";
import { X } from "lucide-react";

type Props = {
  doc: string;
  page: number;
  reason: string;
  image: string;
};

const DOC_LABELS: Record<string, string> = {
  "owner-manual": "Owner's Manual",
  "quick-start-guide": "Quick Start Guide",
  "selection-chart": "Selection Chart",
};

export default function PageReference({ doc, page, reason, image }: Props) {
  const [zoom, setZoom] = useState(false);
  const label = DOC_LABELS[doc] ?? doc;

  return (
    <>
      <div className="my-3 overflow-hidden rounded-xl border border-[#26262d] bg-[#131316]">
        <div className="flex items-center gap-2 border-b border-[#26262d] bg-[#1a1a1f] px-3 py-2">
          <span className="text-xs uppercase tracking-wide text-[#ff6b35]">
            Manual ref
          </span>
          <span className="text-sm font-medium text-white">
            {label} — page {page}
          </span>
        </div>
        {reason && (
          <div className="border-b border-[#26262d] px-3 py-2 text-xs text-[#9a9aa3]">
            {reason}
          </div>
        )}
        <button
          onClick={() => setZoom(true)}
          className="block w-full bg-white p-0 transition hover:opacity-90"
          aria-label="Expand page"
        >
          <img
            src={image}
            alt={`${label} page ${page}`}
            className="block max-h-[420px] w-full object-contain"
          />
        </button>
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setZoom(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoom(false);
            }}
            className="absolute right-4 top-4 rounded-full bg-[#1a1a1f] p-2 text-white hover:bg-[#26262d]"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <img
            src={image}
            alt={`${label} page ${page}`}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
