# Meiring's Virtual CV

My portfolio website: who I am, what I have built, and the CV itself — plus an AI assistant that answers questions about it.

View it live: **[meiring47817909.github.io/Virtual-CV](https://meiring47817909.github.io/Virtual-CV/)**

## Sections

**About Me** — a short introduction, the languages and tools I work with, my contact details, my education, and a bit about squash.

**Resume / CV** — my CV rendered in the browser with PDF.js, so you can read all four pages without downloading anything. The assistant can highlight the exact words it is quoting.

**Projects** — grouped by year, newest first.

| Year | Project | Repository |
|---|---|---|
| 2026 | SmartStock-NWU — stock and loan management for the NWU IT store | [SmartStock-NWU](https://github.com/Meiring47817909/SmartStock-NWU) |
| 2026 | PotchMatch — SOC monitoring and GraphRAG over a squash platform | [potchmatch-soc-graphrag](https://github.com/Meiring47817909/potchmatch-soc-graphrag) |
| 2026 | PotchPulse — real-time water infrastructure monitoring on Azure | [potchpulse-swim](https://github.com/Meiring47817909/potchpulse-swim) |
| 2025 | Carwash business model — Oracle SQL scripts and reporting queries | [CarwashBusinessModel](https://github.com/Meiring47817909/CarwashBusinessModel) |
| 2024 | DREAMFLIX Cinema — desktop booking and reporting (group project) | [CMPG223-Project](https://github.com/CMPG223-GROUP6/CMPG223-Project) |
| 2024 | Brighton Medical — desktop and web appointment booking | [MedicalPractice](https://github.com/Meiring47817909/MedicalPractice) |

## CV Assistant

A retrieval-augmented chatbot that answers questions about my CV and my Honours modules, and points at the matching text in the CV viewer.

- **Retrieval** — my CV and module descriptions are chunked by heading and embedded with `BAAI/bge-small-en-v1.5`, then stored in a Pinecone index.
- **Answers** — Google Gemini writes the reply from the retrieved chunks only, so it stays grounded in the CV.
- **Highlighting** — `cv-index.json` records where every word sits on every page as a fraction of the page, so highlights stay correct at any zoom level.
- **Backend** — a FastAPI service hosted on a Hugging Face Space.

The backend and its source data live outside this repository; only the website and the word index are version-controlled here.

## Files

| File | Purpose |
|---|---|
| [index.html](index.html) | Page structure and all three tabs |
| [site.css](site.css) | Styling: glass cards, sidebar, chat window, project year headings |
| [site.js](site.js) | Tab switching, chat window, speech input, waving robot |
| [cv-viewer.js](cv-viewer.js) | Renders the CV with PDF.js and draws the assistant's highlights |
| [cv-index.json](cv-index.json) | Word positions for every page of the CV |
| [aurora-bg.js](aurora-bg.js) | Animated WebGL background |
| [tools/build_cv_index.py](tools/build_cv_index.py) | Rebuilds `cv-index.json` whenever the CV PDF changes |

Rebuild the word index after replacing the CV:

```bash
pip install pymupdf
python tools/build_cv_index.py
```

Pages with real text are read straight from the PDF; scanned pages fall back to OCR, which needs Tesseract on your PATH.

## Built with

- [Bootstrap 5.3](https://getbootstrap.com/docs/5.3/getting-started/introduction/) — layout, grid and tabs
- [Font Awesome 7](https://fontawesome.com/icons) — icons
- [PDF.js](https://mozilla.github.io/pdf.js/) — in-browser CV rendering
- [dotLottie](https://dotlottie.io/) — the animated robot
- [marked](https://marked.js.org/) and [DOMPurify](https://github.com/cure53/DOMPurify) — rendering and sanitising the assistant's replies
- Google Fonts: Space Grotesk, Inter, Plus Jakarta Sans

## Accessibility and motion

The site respects `prefers-reduced-motion`: the aurora background and the waving robot stay still for visitors who ask for less motion. The robot also stops waving while the chat window is open.
