"use client";

import { useEffect, useRef, useState } from "react";
import { Fold, isDark, SAND_FAR, SAVED_NOTE, ShareButton, THEMES, Versions, readSaved, useThemeColors, writeSaved, type ThemeName } from "./lab";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Sand-dissolve scroll text.
 *
 * The text is ordinary HTML. Every word is a span. When a word crosses the
 * "dissolve line" near the top of the window, the span is hidden and replaced,
 * pixel for pixel, by grains drawn on a canvas. Each grain lets go at its own
 * height within a short band above the line, so how far a word has broken up
 * depends only on where it is on screen, never on how fast you scroll.
 * Loose grains are drawn up into an invisible funnel: they speed up and
 * squeeze toward the centre as they climb, and leave through the top of the
 * window. A light, constant stream keeps rising even when the page is still.
 * Scrolling back down brings the word back.
 */


// A page built on top of the sand text (for example the cathedral hero) can
// keep its own settings, put something behind the text and add to the panel.
// Where the funnel's neck is, as a share of the window height from the top.
// 0 is the top of the screen. A page can move it (the cathedral page puts it
// inside the window).
// `w` is the width the dust keeps at the top, as a share of the window height
// (the cathedral page gives the window's width). `loose` goes from 0, a tight
// funnel, to 1, a loose drift that fills that width and fades at all heights.
export const sandNeck = { y: 0, w: 0, loose: 0 };

export type Variant = {
  name: string; // where its settings are remembered
  href: string; // its entry in the version switcher
  defaults?: Partial<Settings>;
  backdrop?: React.ReactNode;
  extra?: React.ReactNode; // sections added at the top of the panel
  scroll?: React.ReactNode; // added to the scroll section
  reset?: React.ReactNode; // added beside the reset button
};

export type Settings = {
  start: number; // where the text begins on load, as a fraction of window height
  line: number; // where the sand starts, as a fraction of window height from the top
  soft: number; // height in pixels of the band where a word breaks up
  launch: number; // how fast grains jump away from the text as it breaks up
  settle: number; // seconds a grain takes to slow from lift-off speed to rise speed
  rise: number; // how fast grains travel once they are in the stream
  back: number; // seconds sand takes to gather back into a word when scrolling down
  density: number; // share of a word's grains that survive into the stream
  pull: number; // how tightly the funnel squeezes toward the centre
  stream: number; // constant trickle of grains when nothing is scrolling
  glimmer: number; // how much the grains twinkle and glint
  grain: number; // grain size in CSS pixels
  weight: number; // scroll friction: 0 = none, 1 = very heavy
  speed: number; // how far one flick of the wheel or trackpad travels
};

// Colours. `sand` is the ramp a grain travels along as it drifts away: it
// starts at the text colour and ends at the last stop. Add stops in between
// to run the sand through a whole palette.
// `line` is the colour of the drawn lines (the window and the cathedral) on the cathedral page.
// `line` is the window's lines. `nave` is the cathedral's lines and `shade` the darkening toward the
// edges of the screen; left empty, nave follows the window lines and shade is black on a dark page, the text colour on a light one.
type Colors = { paper: string; ink: string; far: string; line: string; nave: string; shade: string };
// `paper` and `ink` are Neesh's working picks and are not in the brand kit yet.
// `far` is the kit's lightest neutral, --color-neutral-00.
const COLOR_DEFAULTS: Colors = { paper: "#6e6a66", ink: "#f6f6f4", far: "#e8e8e3", line: "#cecec0", nave: "", shade: "" };
// Starting colours for each theme: Neesh's picks on the hero as of 2026-11-16.
// The dust fades toward `far`. `line` colours the window and the cathedral.
export const BASE_COLORS: Record<ThemeName, Colors> = {
  light: { paper: THEMES.light.paper, ink: THEMES.light.ink, far: "#e8e8e3", line: THEMES.light.ink, nave: "", shade: "" },
  medium: COLOR_DEFAULTS,
  dark: { paper: THEMES.dark.paper, ink: "#a6a299", far: "#1a1a17", line: "#a6a299", nave: "", shade: "" },
  custom: { paper: THEMES.custom.paper, ink: THEMES.custom.ink, far: SAND_FAR, line: THEMES.custom.ink, nave: "", shade: "" },
};
// The kit's neutrals, read from app/tokens.css when the page loads.
const KIT_TOKENS = ["--color-neutral-00", "--color-cream", "--color-taupe", "--color-smoke"];
const sandRamp = (c: Colors): string[] => [c.ink, c.far];

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
// Colour at position t (0 to 1) along a list of hex stops.
const rampAt = (stops: string[], t: number) => {
  const f = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const a = hex(stops[Math.floor(f)]);
  const b = hex(stops[Math.floor(f) + 1]);
  const k = f - Math.floor(f);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
};

// Neesh's settings on the hero as of 2026-11-16.
const DEFAULTS: Settings = { start: 0.6, line: 0.53, soft: 30, launch: 1.3, settle: 0.22, rise: 0.25, back: 0.35, density: 0.7, pull: 0.95, stream: 0.2, glimmer: 0.05, grain: 0.5, weight: 0.8, speed: 0.4 };

const MAX = 140_000;
const BUCKETS = 7;
const OVER = 300; // canvas extends this far past the window, top and bottom

// One piece of ink on one line: a word, the half of a hyphenated word that
// sits on one line, or the logo image.
type Part = {
  text: string;
  img: HTMLImageElement | null;
  x: number; // document coordinates
  y: number;
  w: number;
  h: number;
  face?: Face; // set when the word is in a different type from the body, such as a header
};
// A typeface as the drawing surface needs it.
type Face = { font: string; track: string; ascent: number };

// Something that turns to sand as a unit. Usually one part; a word that was
// hyphenated across two lines has two.
type Word = {
  el: HTMLElement;
  parts: Part[];
  y: number; // top of the first part
  h: number;
  gone: boolean;
  gen: number;
  keep: boolean; // in the closing paragraph, which never turns to sand
};

type Glyphs = { xs: Float32Array; ys: Float32Array; n: number };

// How far the eye is from the page, in pixels, when the text is set in perspective.
const DEPTH = 1200;

export default function SandText({ paragraphs, variant }: { paragraphs: string[]; variant?: Variant }) {
  const BASE: Settings = { ...DEFAULTS, ...variant?.defaults };
  const columnRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [kit, setKit] = useState<{ token: string; value: string }[]>([]);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setKit(KIT_TOKENS.map((token) => ({ token, value: cs.getPropertyValue(token).trim().toLowerCase() })).filter((k) => k.value));
  }, []);
  const [settings, setSettings] = useState<Settings>(BASE);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Colours are kept per theme.
  const themed = useThemeColors<Colors>("home", BASE_COLORS, "medium");
  const colors = themed.colors;
  const setColors = themed.setColors;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  // Show a guide line for a moment whenever the sand start is moved.
  const [guide, setGuide] = useState(false);
  // The page ends with the closing paragraph resting just below the sand line:
  // it is the last thing said, so it stays as text. The space under it is
  // sized so the page cannot scroll it up into the sand.
  const [endPad, setEndPad] = useState<number | null>(null);
  useEffect(() => {
    const column = columnRef.current;
    const last = column?.querySelector<HTMLElement>("p:last-of-type");
    if (!column || !last) return;
    const size = () => {
      const gap = 28 + settings.soft;
      // Everything from the top of the closing paragraph down to the end of the column's contents.
      const tilt = tiltRef.current;
      const was = tilt?.style.transform ?? "";
      if (tilt) tilt.style.transform = "none"; // measure the text flat
      const tail = (column.lastElementChild as HTMLElement).getBoundingClientRect().bottom - last.getBoundingClientRect().top;
      if (tilt) tilt.style.transform = was;
      setEndPad(Math.max(24, Math.round(window.innerHeight * (1 - settings.line) - gap - tail)));
    };
    size();
    const seen = new ResizeObserver(size);
    seen.observe(last);
    window.addEventListener("resize", size);
    return () => {
      seen.disconnect();
      window.removeEventListener("resize", size);
    };
  }, [settings.line, settings.soft]);
  const relayoutRef = useRef<() => void>(() => {});
  const guideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const column = columnRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- particle store (struct of arrays) ----
    const px = new Float32Array(MAX);
    const py = new Float32Array(MAX);
    const ox = new Float32Array(MAX); // sideways offset from the funnel's axis at release
    const vy = new Float32Array(MAX);
    const age = new Float32Array(MAX);
    const t0 = new Float32Array(MAX); // how far up the funnel the grain was at release
    const prog = new Float32Array(MAX); // how far up the funnel it is now, 0 to 1
    // hold > 0: still part of a word, value = how far above the line it lets go.
    // hold = 0: loose, came from a word. hold = -1: loose, part of the constant stream.
    // hold = -2: flying back to rebuild a word; ox / t0 hold where it is headed.
    const hold = new Float32Array(MAX);
    const seed = new Float32Array(MAX);
    const size = new Float32Array(MAX);
    const owner = new Int32Array(MAX);
    const ownerGen = new Int32Array(MAX);
    let count = 0;

    const kill = (i: number) => {
      const j = --count;
      px[i] = px[j]; py[i] = py[j]; ox[i] = ox[j]; vy[i] = vy[j];
      age[i] = age[j]; t0[i] = t0[j]; prog[i] = prog[j]; hold[i] = hold[j];
      seed[i] = seed[j]; size[i] = size[j];
      owner[i] = owner[j]; ownerGen[i] = ownerGen[j];
    };

    // ---- words ----
    let words: Word[] = [];
    let colLeft = 0; // text column, document coordinates
    let colWidth = 400;

    let font = "";
    let ascent = 0;
    let bodyTrack = "0px";
    const glyphCache = new Map<string, Glyphs>();
    const sampler = document.createElement("canvas");
    const sctx = sampler.getContext("2d", { willReadFrequently: true })!;

    // Headers are set in their own type, so their sand is cut from that type too.
    const faces = new Map<Element, Face | undefined>();
    const faceOf = (el: HTMLElement): Face | undefined => {
      const p = el.closest("p");
      if (!p || !p.classList.contains("head")) return undefined;
      if (faces.has(p)) return faces.get(p);
      const cs = getComputedStyle(p);
      const f = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const track = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      sctx.font = f;
      const face = { font: f, track, ascent: sctx.measureText("Hg").fontBoundingBoxAscent };
      faces.set(p, face);
      return face;
    };

    // The text can be set in perspective (see the frame loop). Everything is
    // measured with the text flat; at the sand line the two agree.
    const tilt = tiltRef.current;
    let tiltTop = 0; // top of the text, document coordinates
    const measure = () => {
      const tilted = tilt?.style.transform ?? "";
      if (tilt) {
        tilt.style.transform = "none";
        tiltTop = tilt.getBoundingClientRect().top + window.scrollY;
      }
      try {
        measureFlat();
      } finally {
        if (tilt) tilt.style.transform = tilted;
      }
    };
    const measureFlat = () => {
      faces.clear();
      const cs = getComputedStyle(column);
      bodyTrack = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      const nextFont = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if (nextFont !== font) glyphCache.clear();
      font = nextFont;
      sctx.font = font;
      ascent = sctx.measureText("Hg").fontBoundingBoxAscent;

      const sx = window.scrollX;
      const sy = window.scrollY;
      const cr = column.getBoundingClientRect();
      colLeft = cr.left + sx;
      colWidth = cr.width;
      const els = column.querySelectorAll<HTMLElement>(".w");
      const shiftOf = (el: Element) => {
        const t = getComputedStyle(el).transform;
        return t && t !== "none" ? new DOMMatrixReadOnly(t).m42 : 0;
      };
      const lift = shiftOf(column);
      const prev = words;
      const range = document.createRange();
      words = Array.from(els, (el, i) => {
        const img = el instanceof HTMLImageElement ? el : null;
        const text = (el.textContent ?? "").replace(/\u00ad/g, "");
        const node = el.firstChild;
        // Measure the letters themselves, not the word's box: a word set as a
        // block has a box as tall as the line, which would put the sand a few
        // pixels above the letters it replaces.
        let rects: DOMRect[];
        if (img) rects = [el.getBoundingClientRect()];
        else if (node && node.nodeType === Node.TEXT_NODE) {
          range.selectNodeContents(node);
          rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
        } else rects = Array.from(el.getClientRects()).filter((r) => r.width > 0);
        // While the opening is still moving the column or this word, measure where it will come to rest.
        const dy = lift + shiftOf(el);
        const face = img ? undefined : faceOf(el);
        const box = (r: DOMRect, t: string): Part => ({ text: t, img, x: r.left + sx, y: r.top + sy - dy, w: r.width, h: r.height, face });
        let parts: Part[];
        if (rects.length === 2 && node && node.nodeType === Node.TEXT_NODE) {
          // Hyphenated across two lines: find the letter where line two begins.
          const raw = node.textContent ?? "";
          let cut = raw.length;
          for (let c = 1; c < raw.length; c++) {
            range.setStart(node, c);
            range.setEnd(node, c + 1);
            const cr2 = range.getBoundingClientRect();
            if (cr2.width > 0 && cr2.top > rects[0].top + rects[0].height / 2) { cut = c; break; }
          }
          parts = [
            box(rects[0], raw.slice(0, cut).replace(/\u00ad/g, "") + "-"),
            box(rects[1], raw.slice(cut).replace(/\u00ad/g, "")),
          ];
        } else {
          parts = [box(rects[0] ?? el.getBoundingClientRect(), text)];
        }
        return {
          el,
          parts,
          y: parts[0].y,
          h: parts[0].h,
          gone: prev[i]?.gone ?? false,
          gen: prev[i]?.gen ?? 0,
          keep: el.closest("p") === column.querySelector("p:last-of-type"),
        };
      });
    };

    // Draw a word off screen and return where its ink is, one entry per grain.
    const sample = (word: Part, grain: number): Glyphs => {
      const key = word.img ? `${grain}|img|${word.img.src}|${Math.round(word.w)}x${Math.round(word.h)}` : `${grain}|${word.face?.font ?? ""}|${word.text}`;
      const hit = glyphCache.get(key);
      if (hit) return hit;
      if (word.img && !(word.img.complete && word.img.naturalWidth > 0)) return { xs: new Float32Array(0), ys: new Float32Array(0), n: 0 };
      const scale = 1 / grain;
      const cw = Math.max(1, Math.ceil((word.w + 4) * scale));
      const ch = Math.max(1, Math.ceil((word.h + 4) * scale));
      sampler.width = cw;
      sampler.height = ch;
      sctx.setTransform(scale, 0, 0, scale, 0, 0);
      sctx.font = word.face?.font ?? font;
      (sctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = word.face?.track ?? bodyTrack;
      sctx.textBaseline = "alphabetic";
      sctx.fillStyle = "#000";
      if (word.img) sctx.drawImage(word.img, 0, 0, word.w, word.h);
      else sctx.fillText(word.text, 0, word.face?.ascent ?? ascent);
      const data = sctx.getImageData(0, 0, cw, ch).data;
      const xs: number[] = [];
      const ys: number[] = [];
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const a = data[(y * cw + x) * 4 + 3];
          // Soft edges become a matching share of grains.
          if (a > 40 && Math.random() * 235 < a) {
            xs.push(x * grain);
            ys.push(y * grain);
          }
        }
      }
      const g = { xs: Float32Array.from(xs), ys: Float32Array.from(ys), n: xs.length };
      glyphCache.set(key, g);
      return g;
    };

    const dissolve = (word: Word, index: number, withSand: boolean) => {
      word.gone = true;
      word.gen++;
      word.el.classList.add("gone");
      if (!withSand) return;
      const s = settingsRef.current;
      // When a fast scroll floods the page with sand, thin out new grains.
      const load = count / MAX;
      const keep = load < 0.35 ? 1 : Math.max(0.12, 1 - (load - 0.35) / 0.65);
      for (const part of word.parts) {
      const g = sample(part, s.grain);
      for (let k = 0; k < g.n && count < MAX; k++) {
        if (keep < 1 && Math.random() > keep) continue;
        const i = count++;
        px[i] = part.x + g.xs[k];
        py[i] = part.y + g.ys[k];
        ox[i] = 0;
        vy[i] = 0;
        age[i] = 0;
        t0[i] = 0;
        prog[i] = 0;
        // How far above the line this grain rides before it lets go.
        hold[i] = 0.5 + Math.random() * s.soft;
        if (part.img) hold[i] = 0.5 + Math.random() * 4; // the logo erodes in a tight edge
        seed[i] = Math.random() * 6.283;
        size[i] = s.grain * (0.8 + Math.random() * 0.6);
        owner[i] = index;
        ownerGen[i] = word.gen;
      }
      }
    };

    // Scrolling back down: sand gathers from above and settles into the
    // word's letters, then the real text fades in on top (see .w in the CSS).
    const restore = (word: Word, index: number, withSand: boolean) => {
      word.gone = false;
      word.gen++; // any grains still holding the word's shape are dropped
      word.el.classList.remove("gone");
      if (!withSand) return;
      const s = settingsRef.current;
      const load = count / MAX;
      const keep = 0.7 * (load < 0.35 ? 1 : Math.max(0.12, 1 - (load - 0.35) / 0.65));
      for (const part of word.parts) {
      const g = sample(part, s.grain);
      for (let k = 0; k < g.n && count < MAX; k++) {
        if (Math.random() > keep) continue;
        const i = count++;
        ox[i] = part.x + g.xs[k];
        t0[i] = part.y + g.ys[k];
        // Start scattered above the word.
        px[i] = ox[i] + (Math.random() - 0.5) * 150;
        py[i] = t0[i] - 25 - Math.random() * 130;
        vy[i] = 0.55 + Math.random() * 0.45; // each grain's own share of the gather time
        age[i] = 0;
        prog[i] = 1;
        hold[i] = -2;
        seed[i] = Math.random() * 6.283;
        size[i] = s.grain * (0.8 + Math.random() * 0.6);
        owner[i] = index;
        ownerGen[i] = word.gen;
      }
      }
    };

    // ---- canvas ----
    let vw = 0;
    let vh = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      vw = window.innerWidth;
      vh = window.innerHeight;
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh + OVER * 2}px`;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round((vh + OVER * 2) * dpr);
      measure();
    };

    // ---- loop ----
    let raf = 0;
    let last = performance.now();
    let lastScroll = window.scrollY;
    let first = true;
    let time = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      const s = settingsRef.current;
      const sy = window.scrollY;
      const sx = window.scrollX;
      const scrolled = sy - lastScroll;
      lastScroll = sy;

      // Which words have crossed the line?
      const lineY = sy + vh * s.line;

      // Perspective: the text leans back about the sand line, so it is its
      // true size where it turns to sand and a little larger toward the
      // bottom of the screen. The setting is how much larger it is there.
      if (tilt) {
        const more = (parseFloat(document.documentElement.style.getPropertyValue("--text-tilt")) || 0) / 100;
        const below = Math.max(80, vh * (1 - s.line));
        if (more > 0) {
          const lean = Math.atan((DEPTH * more) / ((1 + more) * below));
          tilt.style.transformOrigin = `50% ${(lineY - tiltTop).toFixed(1)}px`;
          tilt.style.transform = `perspective(${DEPTH}px) rotateX(${lean.toFixed(5)}rad) scaleY(${(1 / Math.cos(lean)).toFixed(5)})`; // the stretch keeps line spacing from closing up as the text leans
        } else if (tilt.style.transform) tilt.style.transform = "";
      }
      const speed = dt > 0 ? scrolled / dt : 0; // page speed, pixels per second
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (!word.gone && !word.keep && word.y < lineY) {
          const visible = word.y + word.h > sy - 40;
          dissolve(word, i, visible && !first && !reduced);
        } else if (word.gone && word.y > lineY + 3) {
          const visible = word.y + word.h > sy - 40 && word.y < sy + vh + 40;
          restore(word, i, visible && !first && !reduced && s.back > 0.05);
        }
      }
      first = false;

      // The funnel is fixed to the window: its mouth is the line where the
      // sand starts, its neck is the top of the window, above the column.
      const lineScreen = Math.max(1, vh * s.line);
      const neckY = Math.min(lineScreen * 0.85, vh * sandNeck.y);
      const axis = colLeft + colWidth / 2;
      const squeeze = 0.5 + s.pull * 3; // higher = narrows sooner
      const drifty = sandNeck.loose;
      // Width of the neck as a share of the mouth.
      const neck = 0.05 + (Math.min(1.2, (sandNeck.w * vh) / Math.max(1, colWidth)) - 0.05) * drifty;
      // Upward speed at a point in the funnel: quick from the first moment,
      // faster still toward the neck. Each grain has its own pace.
      const climb = (t: number, sd: number) =>
        -(6 + s.rise * (230 + 420 * t * (1 - drifty))) * (1 - 0.45 * drifty) * (0.7 + 0.7 * ((sd * 3.7) % 1));
      // Speed in the first moment after a grain lets go. It then eases to
      // the climbing speed above over the `settle` time.
      const launch = (sd: number) => -s.launch * 230 * (0.7 + 0.7 * ((sd * 3.7) % 1));
      const shape = (t: number) => neck + (1 - neck) * Math.pow(1 - t, squeeze);

      // Nothing happens until the first word reaches the line. After that a
      // constant trickle rises from it, so the stream never stops.
      const started = words.length > 0 && words[0].y < lineY;
      if (!reduced && started) {
        let n = s.stream * 320 * dt;
        n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        for (let k = 0; k < n && count < MAX; k++) {
          const i = count++;
          px[i] = colLeft + Math.random() * colWidth;
          py[i] = lineY - Math.random() * (s.soft + 6);
          ox[i] = px[i] - axis;
          age[i] = 0;
          t0[i] = Math.min(0.9, Math.max(0, 1 - (py[i] - sy) / lineScreen));
          prog[i] = t0[i];
          hold[i] = -1;
          seed[i] = Math.random() * 6.283;
          vy[i] = launch(seed[i]);
          size[i] = s.grain * (0.7 + Math.random() * 0.5);
          owner[i] = -1;
          ownerGen[i] = 0;
        }
      }

      // Move grains.
      const ease = Math.min(1, dt / Math.max(0.02, s.settle));
      for (let i = count - 1; i >= 0; i--) {
        if (hold[i] === -2) {
          // Flying home. Ease toward the target, then wait under the
          // fading-in text until the whole gather time has passed.
          age[i] += dt;
          if (age[i] > s.back * 1.25 || words[owner[i]]?.gen !== ownerGen[i]) { kill(i); continue; }
          const u = Math.min(1, age[i] / (s.back * vy[i]));
          const k = Math.min(1, (dt / (s.back * vy[i])) * (2 + 6 * u));
          px[i] += (ox[i] - px[i]) * k;
          py[i] += (t0[i] - py[i]) * k;
          if (u >= 1) { px[i] = ox[i]; py[i] = t0[i]; }
          prog[i] = (1 - u) * 0.8;
          continue;
        }
        if (hold[i] > 0) {
          // Still holding the word's shape.
          if (words[owner[i]]?.gen !== ownerGen[i]) { kill(i); continue; }
          if (py[i] < lineY - hold[i]) {
            // Only some grains join the stream, which keeps it airy.
            if (Math.random() > s.density) { kill(i); continue; }
            hold[i] = 0;
            ox[i] = px[i] - axis;
            t0[i] = Math.min(0.9, Math.max(0, 1 - (py[i] - sy) / lineScreen));
            prog[i] = t0[i];
            // Jump away at lift-off speed, plus a little of the page's momentum.
            vy[i] = launch(seed[i]) - Math.max(0, Math.min(900, speed)) * 0.06 * Math.random();
          }
          continue;
        }
        age[i] += dt;
        // Loose grains live in the window, not the page: undo the scroll.
        py[i] += scrolled;
        const screenY = py[i] - sy;
        if (screenY < neckY - 8 || age[i] > 14) { kill(i); continue; }
        const t = Math.min(1, Math.max(0, 1 - (screenY - neckY) / (lineScreen - neckY)));
        prog[i] = t;
        vy[i] += (climb(t, seed[i]) - vy[i]) * ease;
        py[i] += vy[i] * dt;
        // Sideways position follows the funnel's wall, with a slow sway.
        const span = 1 - t0[i];
        const tt = span > 0.001 ? Math.max(0, (t - t0[i]) / span) : 1;
        const sway = Math.sin(time * 1.1 + seed[i] * 3 + screenY * 0.012) * (9 + 22 * drifty) * Math.sin(Math.PI * Math.min(1, tt * 1.4));
        px[i] = axis + ox[i] * shape(tt) + sway;
      }

      // Draw, grouped by opacity so each group is a single fill.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh + OVER * 2);
      // The canvas lives in the page and is moved to the window each frame.
      // If the browser scrolls a little before the next frame is drawn, the
      // canvas rides along with the text, so grains never slip against words.
      canvas.style.transform = `translate(${sx}px, ${sy - OVER}px)`;
      // Bucket 0 is grains still holding a word; later buckets are grains
      // further up the funnel, further along the colour ramp.
      const ramp = sandRamp(colorsRef.current);
      const blink = s.glimmer * 0.75; // share of the twinkle cycle a grain spends dark
      for (let b = 0; b < BUCKETS; b++) {
        const t = b / (BUCKETS - 1);
        ctx.fillStyle = rampAt(ramp, t);
        ctx.globalAlpha = b === 0 ? 1 : 0.9;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const loose = hold[i] <= 0;
          const bucket = loose ? Math.min(BUCKETS - 1, 1 + Math.floor(prog[i] * (BUCKETS - 1))) : 0;
          if (bucket !== b) continue;
          if (hold[i] === -2) {
            // Grains flying home appear gradually and do not twinkle.
            if (age[i] < 0.2 && Math.random() > age[i] * 5) continue;
          } else if (loose) {
            // Twinkle: each grain winks out for part of its own cycle. Stream
            // grains also ease in so they never pop into view.
            const wink = 0.5 + 0.5 * Math.sin(time * (3 + (seed[i] % 1) * 5) + seed[i] * 17);
            if (wink < blink * Math.min(1, age[i] * 1.5)) continue;
            if (hold[i] < 0 && age[i] < 0.5 && Math.random() > age[i] * 2) continue;
            // Thin out toward the neck so the stream dissolves, not stops.
            // Very slow grains fade out with age instead of lingering forever.
            if (age[i] > 10 && Math.random() < (age[i] - 10) / 4) continue;
            // Loose dust: each grain fades out at its own height, so the
            // cloud thins all the way up instead of gathering at the top.
            if (drifty > 0) {
              const cut = 1 - drifty * 0.85 * ((seed[i] * 7.3) % 1);
              if (prog[i] > cut - 0.12 && Math.random() < (prog[i] - cut + 0.12) / 0.12) continue;
            }
            const thin = 0.75;
            if (prog[i] > thin && Math.random() < (prog[i] - thin) / (1 - thin)) continue;
          }
          const y = py[i] - sy + OVER;
          if (y < -4 || y > vh + OVER * 2 + 4) continue;
          ctx.rect(px[i] - sx, y, size[i], size[i]);
        }
        ctx.fill();
      }
      // Glints: now and then a grain catches the light.
      if (s.glimmer > 0) {
        ctx.fillStyle = ramp[ramp.length - 1];
        ctx.globalAlpha = 1;
        ctx.beginPath();
        const rare = 1 - 0.02 * s.glimmer;
        for (let i = 0; i < count; i++) {
          if (hold[i] > 0 || hold[i] === -2) continue;
          if (Math.sin(time * 2.3 + seed[i] * 53) < rare) continue;
          if (prog[i] > 0.5 && (seed[i] * 11) % 1 < (prog[i] - 0.5) * 2) continue;
          const g = size[i] * 1.8;
          ctx.rect(px[i] - sx - g / 4, py[i] - sy + OVER - g / 4, g, g);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    resize();
    document.fonts?.ready.then(() => {
      glyphCache.clear(); // anything sampled before the brand font arrived is stale
      measure();
    });
    window.addEventListener("resize", resize);
    // Re-measure when the column moves (for example the text start slider).
    // Grains in flight belong to the old layout, so drop them.
    relayoutRef.current = () => {
      measure();
      count = 0;
    };
    const observer = new ResizeObserver(relayoutRef.current);
    observer.observe(column, { box: "border-box" });
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      observer.disconnect();
      words.forEach((w) => w.el.classList.remove("gone"));
    };
  }, []);

  useEffect(() => {
    relayoutRef.current();
  }, [settings.start]);

  // Settings are remembered in this browser, separately for each version.
  const storeKey = `crucible-site:${variant?.name ?? "home"}`;
  const [loaded, setLoaded] = useState(false);
  const apply = (data: { settings?: Partial<Settings>; colors?: Partial<Colors> }) => {
    setSettings({ ...BASE, ...data.settings });
    setColors({ ...COLOR_DEFAULTS, ...data.colors });
  };
  useEffect(() => {
    const saved = readSaved<{ settings?: Partial<Settings> }>(storeKey);
    if (saved?.settings) setSettings({ ...BASE, ...saved.settings });
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  useEffect(() => {
    if (loaded) writeSaved(storeKey, { settings });
  }, [loaded, storeKey, settings]);

  // Save the current settings as a file, or load a saved file back in.
  const download = () => {
    const blob = new Blob([JSON.stringify({ version: "home", settings, colors }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "crucible-home-settings.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      apply(JSON.parse(await file.text()));
    } catch {
      alert("That file is not a saved settings file.");
    }
  };

  // Colours go to the page as CSS variables.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--paper", colors.paper);
    root.setProperty("--ink", colors.ink);
    root.setProperty("--far", colors.far);
    root.setProperty("--line", colors.line || colors.ink);
    root.setProperty("--nave", colors.nave || colors.line || colors.ink);
    root.setProperty("--shade", colors.shade || "");
  }, [colors]);
  useEffect(() => {
    document.documentElement.style.setProperty("--back", `${settings.back}s`);
  }, [settings.back]);

  // Lenis smooths the scroll and adds drag. Lower lerp = heavier feel.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.22 * Math.pow(1 - settings.weight, 1.6) + 0.012,
      wheelMultiplier: settings.speed,
      touchMultiplier: settings.speed,
    });
    return () => lenis.destroy();
  }, [settings.weight, settings.speed]);

  // `auto` is what a colour falls back to while it has not been picked.
  const swatch = (key: keyof Colors, label: string, auto?: string) => (
    <label className="swatch">
      <span>
        {label} <b>{colors[key] || "automatic"}</b>
      </span>
      <input
        type="color"
        value={colors[key] || auto || "#000000"}
        onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
      />
      <span className="chips">
        {kit.map((k) => (
          <button
            key={k.token}
            type="button"
            title={`${k.token.replace("--color-", "")} ${k.value}`}
            className={colors[key] === k.value ? "on" : ""}
            style={{ background: k.value }}
            onClick={(e) => {
              e.preventDefault();
              setColors({ ...colors, [key]: k.value });
            }}
          />
        ))}
      </span>
    </label>
  );

  const slider = (key: keyof Settings, label: string, min: number, max: number, step: number) => (
    <label>
      <span>
        {label} <b>{settings[key].toFixed(2)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={settings[key]}
        onChange={(e) => {
          setSettings({ ...settings, [key]: Number(e.target.value) });
          if (key === "line") {
            setGuide(true);
            if (guideTimer.current) clearTimeout(guideTimer.current);
            guideTimer.current = setTimeout(() => setGuide(false), 1400);
          }
        }}
      />
    </label>
  );

  // The index of each paragraph's first word.
  const starts: number[] = [];
  // A paragraph that begins with "# " is a section header.
  const heads = paragraphs.map((p) => p.startsWith("# "));
  paragraphs = paragraphs.map((p, i) => (heads[i] ? p.slice(2) : p));
  paragraphs.reduce((n, p) => (starts.push(n), n + p.split(" ").length), 0);
  return (
    <>
      {variant?.backdrop}
      <div className="tilt" ref={tiltRef}>
      <div className="column" ref={columnRef} style={{ paddingTop: `${settings.start * 100}vh`, paddingBottom: endPad === null ? undefined : endPad }}>
        {paragraphs.map((p, i) => (
          <p key={i} className={heads[i] ? "head" : undefined}>
            {p.split(" ").map((word, j) => (
              // --i counts words down the page and --j is a little scatter, for bringing the text in word by word.
              <span key={j} style={{ "--i": Math.min(200, starts[i] + j), "--j": (((starts[i] + j) * 37) % 11) / 11 } as React.CSSProperties}>
                {/* Headers are set in capitals in the page itself, so the sand is cut from the same letters. */}
                <span className="w">{heads[i] ? word.toUpperCase() : word}</span>{" "}
              </span>
            ))}
          </p>
        ))}
        {variant?.name === "home" && (
          <div className="end">
            <span className="end-mark" role="img" aria-label="Crucible" />
          </div>
        )}
      </div>
      </div>
      <div className="sand-layer" aria-hidden>
        <canvas className="sand" ref={canvasRef} />
      </div>
      <div className="guide" style={{ top: `${settings.line * 100}vh`, opacity: guide ? 1 : 0 }} />
      <div className="panel" data-lenis-prevent>
        <Versions current={variant?.href ?? "/"} />
        {variant?.extra}
        <Fold id="sand" title="sand">
          {slider("start", "text starts at", 0.2, 0.95, 0.01)}
          {slider("line", "sand starts at", 0.05, 0.9, 0.01)}
          {slider("soft", "edge softness (px)", 0, 200, 5)}
          {slider("launch", "lift-off speed", 0.1, 4, 0.05)}
          {slider("settle", "lift-off length (s)", 0.02, 1.5, 0.02)}
          {slider("rise", "rise speed", 0, 3, 0.05)}
          {slider("back", "gather back (s)", 0, 2, 0.05)}
          {slider("density", "sand density", 0.05, 1, 0.05)}
          {slider("pull", "funnel pull", 0, 1, 0.05)}
          {slider("stream", "constant stream", 0, 1, 0.05)}
          {slider("glimmer", "glimmer", 0, 1, 0.05)}
          {slider("grain", "grain size", 0.5, 2, 0.25)}
        </Fold>
        <Fold id="scroll" title="scroll">
          {slider("weight", "scroll friction", 0, 1, 0.05)}
          {slider("speed", "scroll speed", 0.2, 1.5, 0.05)}
          {variant?.scroll}
        </Fold>
        <Fold id="colour" title="colour" open>
          {swatch("paper", "background")}
          {swatch("ink", "text")}
          {variant && swatch("line", "window lines")}
          {variant && swatch("nave", "cathedral lines", colors.line || colors.ink)}
          {variant && swatch("shade", "outer shade", isDark(colors.paper) ? "#000000" : colors.ink)}
          {swatch("far", "sand fades to")}
        </Fold>
        <Fold id="save" title="save and share">
          <div className="actions">
            <button onClick={download}>save file</button>
            <label className="file">
              load file
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <ShareButton />
          </div>
          <div className="actions">
            <button
              onClick={() => {
                setSettings(BASE);
                themed.reset();
              }}
            >
              reset sand, scroll and colour
            </button>
            {variant?.reset}
          </div>
        </Fold>
        <p className="note">{SAVED_NOTE}</p>
      </div>
    </>
  );
}
