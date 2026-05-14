#!/usr/bin/env python3
"""
Ingest pipeline for the Vulcan OmniPro 220 manual set.

Reads every PDF in ./files/, extracts text per page, renders each page to a JPEG,
and writes a single JSON index that the Next.js app consumes at runtime.

Outputs:
  public/manual/<doc-slug>/page-<n>.jpg
  public/manual/<doc-slug>/thumb-<n>.jpg
  lib/manual-index.json

Run with: .venv/bin/python scripts/ingest.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
FILES_DIR = ROOT / "files"
PUBLIC_DIR = ROOT / "public" / "manual"
INDEX_PATH = ROOT / "lib" / "manual-index.json"

# Render at 150 DPI — sharp enough for Claude to read diagrams, small enough
# that the bundle stays manageable. PDFs are 72 DPI native, so scale = 150/72.
RENDER_SCALE = 150 / 72
THUMB_SCALE = 60 / 72
JPEG_QUALITY = 78


def slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s


def normalize_text(t: str) -> str:
    # Collapse runs of whitespace but keep paragraph breaks
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def ingest_pdf(pdf_path: Path) -> dict:
    doc_slug = slugify(pdf_path.stem)
    out_dir = PUBLIC_DIR / doc_slug
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    pages = []

    for i, page in enumerate(doc, start=1):
        text = normalize_text(page.get_text("text"))

        # Full-resolution page render
        pix = page.get_pixmap(matrix=fitz.Matrix(RENDER_SCALE, RENDER_SCALE), alpha=False)
        img_path = out_dir / f"page-{i:03d}.jpg"
        pix.save(img_path, jpg_quality=JPEG_QUALITY)

        # Thumbnail for sidebar
        tpix = page.get_pixmap(matrix=fitz.Matrix(THUMB_SCALE, THUMB_SCALE), alpha=False)
        thumb_path = out_dir / f"thumb-{i:03d}.jpg"
        tpix.save(thumb_path, jpg_quality=70)

        pages.append({
            "page": i,
            "text": text,
            "image": f"/manual/{doc_slug}/page-{i:03d}.jpg",
            "thumb": f"/manual/{doc_slug}/thumb-{i:03d}.jpg",
            "width": pix.width,
            "height": pix.height,
        })
        print(f"  page {i:3d} — {len(text):>5} chars  {pix.width}x{pix.height}")

    toc = []
    for level, title, page_num in doc.get_toc(simple=True):
        toc.append({"level": level, "title": title.strip(), "page": page_num})

    return {
        "slug": doc_slug,
        "title": pdf_path.stem.replace("-", " ").title(),
        "source_file": pdf_path.name,
        "num_pages": len(pages),
        "toc": toc,
        "pages": pages,
    }


def main() -> int:
    if not FILES_DIR.exists():
        print(f"error: {FILES_DIR} does not exist", file=sys.stderr)
        return 1

    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    documents = []
    for pdf_path in sorted(FILES_DIR.glob("*.pdf")):
        print(f"\n▶ Ingesting {pdf_path.name}")
        documents.append(ingest_pdf(pdf_path))

    index = {
        "product": {
            "name": "Vulcan OmniPro 220",
            "manufacturer": "Vulcan / Harbor Freight",
            "summary": "Industrial multiprocess welder supporting MIG, Flux-Cored, TIG (DC), and Stick processes on 120V or 240V input.",
            "photos": [
                {"path": "/product.webp", "caption": "Vulcan OmniPro 220 — exterior"},
                {"path": "/product-inside.webp", "caption": "Vulcan OmniPro 220 — interior / wire feed compartment"},
            ],
        },
        "documents": documents,
    }

    INDEX_PATH.write_text(json.dumps(index, indent=2))
    total_pages = sum(d["num_pages"] for d in documents)
    print(f"\n✓ Wrote {INDEX_PATH.relative_to(ROOT)} — {len(documents)} docs, {total_pages} pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
