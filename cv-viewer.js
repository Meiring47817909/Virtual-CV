/*
 * cv-viewer.js – shows Meiring_van_Niekerk_CV.pdf with PDF.js so the chat
 * assistant can scroll to text in it and draw a box around it.
 *
 * - Pages are drawn on <canvas> elements by PDF.js.
 * - Word positions come from cv-index.json (built by tools/build_cv_index.py,
 *   with OCR for the scanned pages). They are fractions of the page, so the
 *   box is placed with percentages and stays on the text at any zoom.
 * - window.cvViewer.highlight("CMPG223") is what the chat calls.
 */
(function () {
  "use strict";

  const PDF_URL = "Meiring_van_Niekerk_CV.pdf";
  const INDEX_URL = "cv-index.json";
  const WORKER_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const GUIDE_SECONDS = 9; // how long the robot stays beside the highlight
  const GUTTER = 130; // empty strip right of the pages (desktop) for the robot
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let pdf = null;
  let index = null;
  let zoom = 1; // 1 = fit the page width to the viewer
  let pages = []; // { wrap, canvas, viewport (scale 1), renderedAt }
  let current = null; // { page, box } of the active highlight
  let guideTimer = null;
  let renderTimer = null;
  let readyResolve;
  const ready = new Promise((res) => (readyResolve = res));

  const $ = (sel) => document.querySelector(sel);

  // ---------------------------------------------------------------
  // Loading and drawing pages
  // ---------------------------------------------------------------
  async function init() {
    const scroller = $("#cv-scroll");
    if (!scroller) return;
    if (!window.pdfjsLib) {
      showFallback();
      return;
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;

    try {
      const [doc, idx] = await Promise.all([
        window.pdfjsLib.getDocument(PDF_URL).promise,
        fetch(INDEX_URL)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      pdf = doc;
      index = idx;
    } catch (err) {
      console.error("[cv] could not load the CV", err);
      showFallback();
      return;
    }

    const holder = $("#cv-pages");
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const wrap = document.createElement("div");
      wrap.className = "cv-page";
      wrap.dataset.page = n;
      wrap.style.aspectRatio = viewport.width + " / " + viewport.height;
      const canvas = document.createElement("canvas");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "CV page " + n + " of " + pdf.numPages);
      wrap.appendChild(canvas);
      holder.appendChild(wrap);
      pages.push({ page, wrap, canvas, viewport, renderedAt: 0 });
    }

    $("#cv-page-count").textContent = pdf.numPages;
    layout();
    scroller.addEventListener("scroll", updatePageNumber, { passive: true });
    new ResizeObserver(() => layout()).observe(scroller);
    $("#cv-viewer").classList.add("loaded");
    readyResolve(true);
  }

  function showFallback() {
    const v = $("#cv-viewer");
    if (v) v.classList.add("failed");
    readyResolve(false);
  }

  // Inner width of the viewer (minus padding)
  function innerWidth() {
    const scroller = $("#cv-scroll");
    const style = getComputedStyle(scroller);
    return (
      scroller.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    );
  }

  // On wider viewers keep a strip free right of the pages for the robot
  function gutter() {
    return innerWidth() >= 600 ? GUTTER : 0;
  }

  // Width of a page at zoom 1 = the viewer's width, minus the robot's strip
  function fitWidth() {
    return Math.max(240, Math.min(innerWidth() - gutter(), 1100));
  }

  // Resize the page boxes immediately (canvases stretch), then redraw sharp
  function layout() {
    if (!pages.length) return;
    const width = Math.round(fitWidth() * zoom);
    const g = gutter() + "px";
    pages.forEach((p) => {
      p.wrap.style.width = width + "px";
      p.wrap.style.marginRight = g; // centred together with the strip
    });
    $("#cv-zoom-label").textContent = Math.round(zoom * 100) + "%";
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderAll, 120);
    if (current) placeGuide();
  }

  // Draw every page at the current size. Each page is drawn on a fresh,
  // off-screen canvas and swapped in when finished, so the old picture stays
  // visible meanwhile. A newer call (zoom, resize) cancels an older one.
  let renderGen = 0;
  async function renderAll() {
    const gen = ++renderGen;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scroller = $("#cv-scroll");
    const mid = scroller.scrollTop + scroller.clientHeight / 2;
    // pages nearest the middle of the view first
    const order = [...pages].sort(
      (a, b) =>
        Math.abs(a.wrap.offsetTop + a.wrap.clientHeight / 2 - mid) -
        Math.abs(b.wrap.offsetTop + b.wrap.clientHeight / 2 - mid),
    );

    for (const p of order) {
      if (gen !== renderGen) return;
      const cssWidth = p.wrap.clientWidth;
      const target = Math.round(cssWidth * dpr);
      if (!cssWidth || Math.abs(target - p.renderedAt) < 2) continue;

      if (p.task) {
        p.task.cancel();
        try {
          await p.task.promise;
        } catch (e) {
          /* cancelled */
        }
      }
      if (gen !== renderGen) return;

      const vp = p.page.getViewport({ scale: target / p.viewport.width });
      const fresh = document.createElement("canvas");
      fresh.width = Math.round(vp.width);
      fresh.height = Math.round(vp.height);
      fresh.setAttribute("role", "img");
      fresh.setAttribute("aria-label", p.canvas.getAttribute("aria-label"));
      p.task = p.page.render({ canvasContext: fresh.getContext("2d"), viewport: vp });
      try {
        await p.task.promise;
        p.wrap.replaceChild(fresh, p.canvas);
        p.canvas = fresh;
        p.renderedAt = target;
      } catch (err) {
        if (err && err.name !== "RenderingCancelledException") {
          console.error("[cv] page " + p.wrap.dataset.page + " failed to draw", err);
        }
      } finally {
        p.task = null;
      }
    }
  }

  function setZoom(next) {
    const scroller = $("#cv-scroll");
    // keep the same spot in the middle of the view while zooming
    const midY = (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight;
    zoom = Math.min(3, Math.max(0.5, next));
    layout();
    scroller.scrollTop = midY * scroller.scrollHeight - scroller.clientHeight / 2;
  }

  function stepZoom(dir) {
    const next =
      dir > 0
        ? ZOOM_STEPS.find((z) => z > zoom + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
        : [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.001) ?? ZOOM_STEPS[0];
    setZoom(next);
  }

  function updatePageNumber() {
    const scroller = $("#cv-scroll");
    const mid = scroller.scrollTop + scroller.clientHeight / 3;
    let n = 1;
    for (const p of pages) if (p.wrap.offsetTop <= mid) n = Number(p.wrap.dataset.page);
    $("#cv-page-num").textContent = n;
  }

  // ---------------------------------------------------------------
  // Finding text
  // ---------------------------------------------------------------
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9.]/g, "").replace(/^\.+|\.+$/g, "");

  function tokens(text) {
    return text.split(/\s+/).map(norm).filter(Boolean);
  }

  // Returns { page, words: [...] } for the best match, or null
  function find(query) {
    if (!index) return null;
    const q = tokens(query);
    if (!q.length) return null;

    let best = null;
    index.pages.forEach((pg, pi) => {
      const w = pg.words.map((x) => norm(x[0]));
      // 1. the exact words in order
      for (let i = 0; i + q.length <= w.length; i++) {
        let ok = true;
        for (let k = 0; k < q.length && ok; k++) ok = w[i + k] === q[k];
        if (ok && (!best || best.score < 100)) {
          best = { page: pi, words: pg.words.slice(i, i + q.length), score: 100 };
        }
      }
      // 2. most of the words close together (OCR or wording can differ a bit)
      if (q.length > 1) {
        const span = q.length + 3;
        for (let i = 0; i < w.length; i++) {
          const win = w.slice(i, i + span);
          const hits = q.filter((t) => win.includes(t)).length;
          const score = (hits / q.length) * 90;
          if (hits / q.length >= 0.6 && (!best || score > best.score)) {
            const picked = pg.words.slice(i, i + span).filter((x) => q.includes(norm(x[0])));
            best = { page: pi, words: picked, score };
          }
        }
      }
    });
    if (!best) return null;
    return { page: best.page, box: rowBox(best.page, best.words) };
  }

  // Grow the match to the whole line/table row it sits on, then pad it
  function rowBox(pi, matched) {
    let y0 = Math.min(...matched.map((w) => w[2]));
    let y1 = Math.max(...matched.map((w) => w[4]));
    let x0 = Math.min(...matched.map((w) => w[1]));
    let x1 = Math.max(...matched.map((w) => w[3]));
    const band = y1 - y0;
    index.pages[pi].words.forEach((w) => {
      const c = (w[2] + w[4]) / 2;
      if (c > y0 + band * 0.15 && c < y1 - band * 0.15 && w[4] - w[2] < band * 2.2) {
        x0 = Math.min(x0, w[1]);
        x1 = Math.max(x1, w[3]);
      }
    });
    const padX = 0.008;
    const padY = Math.max(0.004, band * 0.6);
    return {
      x: Math.max(0, x0 - padX),
      y: Math.max(0, y0 - padY),
      w: Math.min(1, x1 + padX) - Math.max(0, x0 - padX),
      h: Math.min(1, y1 + padY) - Math.max(0, y0 - padY),
    };
  }

  // ---------------------------------------------------------------
  // Highlight + robot guide
  // ---------------------------------------------------------------
  async function highlight(query) {
    const ok = await ready;
    if (!ok) return false;
    // The CV tab may have only just become visible: size the pages first
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    layout();
    const hit = find(query);
    if (!hit) return false;

    clear();
    const p = pages[hit.page];
    const box = document.createElement("div");
    box.className = "cv-highlight";
    box.style.left = hit.box.x * 100 + "%";
    box.style.top = hit.box.y * 100 + "%";
    box.style.width = hit.box.w * 100 + "%";
    box.style.height = hit.box.h * 100 + "%";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "cv-highlight-close";
    close.setAttribute("aria-label", "Remove highlight");
    close.textContent = "×";
    close.addEventListener("click", clear);
    box.appendChild(close);
    p.wrap.appendChild(box);
    current = { page: hit.page, box: hit.box, el: box };

    // Scroll so the highlight sits in the upper third of the viewer
    const scroller = $("#cv-scroll");
    const top = p.wrap.offsetTop + hit.box.y * p.wrap.clientHeight - scroller.clientHeight / 3;
    const left = p.wrap.offsetLeft + (hit.box.x + hit.box.w / 2) * p.wrap.clientWidth - scroller.clientWidth / 2;
    scroller.scrollTo({
      top: Math.max(0, top),
      left: Math.max(0, left),
      behavior: reduceMotion.matches ? "auto" : "smooth",
    });

    showGuide();
    return true;
  }

  function clear() {
    if (current && current.el) current.el.remove();
    current = null;
    hideGuide();
  }

  // The guide is a second copy of the chat robot that sits next to the box
  function showGuide() {
    const guide = $("#cv-guide");
    if (!guide || !current) return;
    pages[current.page].wrap.appendChild(guide);
    placeGuide();
    guide.hidden = false;
    guide.classList.remove("arrive");
    void guide.offsetWidth; // restart the fly-in animation
    guide.classList.add("arrive");
    document.body.classList.add("guide-active"); // hides the corner robot

    const player = guide.querySelector("dotlottie-wc");
    const wave = () => {
      const pl = player && player.dotLottie;
      if (pl && !reduceMotion.matches) {
        pl.stop();
        pl.play();
      }
    };
    setTimeout(wave, reduceMotion.matches ? 0 : 450);

    clearTimeout(guideTimer);
    guideTimer = setTimeout(hideGuide, GUIDE_SECONDS * 1000);
  }

  // Beside the box: to its right if there is room, else its left, else above
  function placeGuide() {
    const guide = $("#cv-guide");
    if (!guide || !current) return;
    const wrap = pages[current.page].wrap;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const b = current.box;
    const size = Math.max(64, Math.min(110, W * 0.14));
    const gap = 10;
    const cy = (b.y + b.h / 2) * H;
    let side;
    let left;
    let top = cy - size / 2;
    let beam = gap;
    if (gutter() && zoom <= 1.001) {
      side = "right"; // stands in the empty strip, beam reaches to the box
      left = W + 14;
      beam = left - (b.x + b.w) * W;
    } else if ((1 - b.x - b.w) * W >= size + gap) {
      side = "right";
      left = (b.x + b.w) * W + gap;
    } else if (b.x * W >= size + gap) {
      side = "left";
      left = b.x * W - size - gap;
    } else {
      side = "above";
      left = Math.min(W - size, (b.x + b.w) * W - size);
      top = b.y * H - size - gap;
      if (top < 0) {
        side = "below";
        top = (b.y + b.h) * H + gap;
      }
    }
    guide.style.width = guide.style.height = size + "px";
    guide.style.left = left + "px";
    guide.style.top = top + "px";
    guide.dataset.side = side;
    guide.style.setProperty("--beam", Math.max(gap, beam) + "px");
  }

  function hideGuide() {
    clearTimeout(guideTimer);
    const guide = $("#cv-guide");
    if (guide) {
      guide.hidden = true;
      guide.classList.remove("arrive");
    }
    document.body.classList.remove("guide-active");
  }

  // ---------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", fn);
    };
    on("cv-zoom-out", () => stepZoom(-1));
    on("cv-zoom-in", () => stepZoom(1));
    on("cv-zoom-fit", () => setZoom(1));
    // Ctrl/Cmd + mouse wheel zooms the CV instead of the whole page
    const scroller = document.getElementById("cv-scroll");
    if (scroller) {
      scroller.addEventListener(
        "wheel",
        (e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        },
        { passive: false },
      );
    }
    init();
  });

  window.cvViewer = { ready, highlight, clear, find: (q) => find(q) };
})();
