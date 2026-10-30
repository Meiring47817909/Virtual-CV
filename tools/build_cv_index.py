"""
Build cv-index.json: where every word sits on each page of the CV PDF.

The chat assistant uses it to find text (e.g. "CMPG223") and draw a box around it.
Positions are stored as fractions of the page (0..1), so they stay correct at any
zoom level.

- Pages with real text: words come straight from the PDF (PyMuPDF).
- Scanned pages (no text inside): words come from OCR (Tesseract).

Run again whenever Meiring_van_Niekerk_CV.pdf changes:
    pip install pymupdf
    python tools/build_cv_index.py
(Tesseract must be installed and on PATH for the scanned pages.)
"""
import csv
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "Meiring_van_Niekerk_CV.pdf"
OUT = ROOT / "cv-index.json"
OCR_DPI = 300
MIN_TEXT_WORDS = 20   # fewer words than this = treat the page as a scan


def r(v):
    return round(v, 4)


def text_page_words(page):
    W, H = page.rect.width, page.rect.height
    return [[w[4], r(w[0] / W), r(w[1] / H), r(w[2] / W), r(w[3] / H)]
            for w in page.get_text("words") if w[4].strip()]


def ocr_page_words(page):
    with tempfile.TemporaryDirectory() as tmp:
        img = Path(tmp) / "page.png"
        pix = page.get_pixmap(dpi=OCR_DPI)
        pix.save(img)
        tsv = subprocess.run(["tesseract", str(img), "-", "--psm", "3", "tsv"],
                             capture_output=True, text=True, check=True).stdout
    words = []
    for row in csv.DictReader(io.StringIO(tsv), delimiter="\t", quoting=csv.QUOTE_NONE):
        text = (row.get("text") or "").strip()
        if not text or float(row.get("conf") or -1) < 30:
            continue
        x, y, w, h = (int(row[k]) for k in ("left", "top", "width", "height"))
        words.append([text, r(x / pix.width), r(y / pix.height),
                      r((x + w) / pix.width), r((y + h) / pix.height)])
    return words


def main():
    doc = pymupdf.open(PDF)
    pages = []
    for i, page in enumerate(doc, 1):
        words = text_page_words(page)
        source = "text"
        if len(words) < MIN_TEXT_WORDS:
            words = ocr_page_words(page)
            source = "ocr"
        pages.append({"w": r(page.rect.width), "h": r(page.rect.height),
                      "source": source, "words": words})
        print(f"page {i}: {source:4} {len(words):4} words", file=sys.stderr)
    OUT.write_text(json.dumps({"pdf": PDF.name, "pages": pages}, separators=(",", ":")),
                   encoding="utf-8")
    print(f"wrote {OUT.name} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
