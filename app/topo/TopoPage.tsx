"use client";

import { useEffect, useRef, useState } from "react";
import { Panel, THEMES, ThemeButtons, isDark, readSaved, reducedMotion, useSmoothScroll, useStored, usePageColors, useThemeColors, writeSaved, type Control, type ThemeName } from "../lab";

/**
 * The Topography.
 *
 * The page is a map of the real land around Spruce Pine, North Carolina,
 * read from public elevation data (see public/topo). Contour lines, drawn as
 * rows of fine dots, spread across the window on load. Height is also shown
 * as very soft shading, a step at a time. The text sits on a raised, flat
 * table of land, so the contours ring it like the shore of an island and the
 * real hills take over further out. The pointer raises a small hill of its
 * own. As you scroll you travel south across the land.
 */

type Settings = {
  paper: string;
  ink: string;
  line: string; // dot colour
  side: number; // where the text sits across the window, 0 left to 1 right
  levels: number; // how many contour heights across the whole map
  zoom: number; // how close the map is
  spacing: number; // distance between dots along a line, in pixels
  dot: number; // dot size in pixels
  strength: number; // how visible the dots are
  shade: number; // how much each step of height changes the shading
  glimmer: number; // how many dots catch the light
  clearing: number; // margin of flat ground around the text, in pixels
  wander: number; // how uneven the edge of the clearing is
  rings: number; // how many contour rings the text table raises around itself
  hill: number; // size of the hill under the pointer
  travel: number; // how far the land moves as you scroll
  relief: number; // scrolling stands the map up into layers
  tide: number; // scrolling raises a waterline
  descent: number; // scrolling zooms in toward the town
  loose: number; // scrolling shakes the dots off their lines
  weight: number;
  speed: number;
};

type MapColors = { paper: string; ink: string; line: string };
const theme = (name: ThemeName): MapColors => ({ paper: THEMES[name].paper, ink: THEMES[name].ink, line: THEMES[name].dots });
const MAP_BASE: Record<ThemeName, MapColors> = { light: theme("light"), medium: theme("medium"), dark: theme("dark"), custom: theme("custom") };

const DEFAULTS: Settings = {
  ...theme("light"),
  side: 0.78,
  levels: 44,
  zoom: 1,
  spacing: 4,
  dot: 1.2,
  strength: 0.6,
  shade: 0.5,
  glimmer: 0.4,
  clearing: 90,
  rings: 0,
  wander: 0.7,
  hill: 0.5,
  travel: 0.3,
  relief: 0,
  tide: 0,
  descent: 0,
  loose: 0,
  weight: 0.6,
  speed: 0.7,
};

// Topo 2 starts with one scroll effect on; the buttons switch between them.
const FX_OFF = { relief: 0, tide: 0, descent: 0, loose: 0 };
const DEFAULTS_2: Settings = { ...DEFAULTS, ...FX_OFF, descent: 0.8, glimmer: 0 };
// The scroll presets on Topo 2. Each one remembers how its sliders were left.
type Fx = typeof FX_OFF;
const FX_KEYS = Object.keys(FX_OFF) as (keyof Fx)[];
const PRESETS: Record<string, Fx> = {
  relief: { ...FX_OFF, relief: 0.6 },
  tide: { ...FX_OFF, tide: 0.7 },
  descent: { ...FX_OFF, descent: 0.8 },
  "loose sand": { ...FX_OFF, loose: 0.6 },
  all: { relief: 0.5, tide: 0.6, descent: 0.5, loose: 0.3 },
};
const PRESET_KEY = "crucible-site:topo-fx-presets";
type PresetStore = { mode?: string; slots?: Record<string, Fx> };

const FX_CONTROLS: Control<Settings>[] = [
  { key: "relief", label: "relief (stands up)", min: 0, max: 1, step: 0.05 },
  { key: "tide", label: "tide (waterline)", min: 0, max: 1, step: 0.05 },
  { key: "descent", label: "descent (zoom)", min: 0, max: 1, step: 0.05 },
  { key: "loose", label: "loose sand", min: 0, max: 1, step: 0.05 },
];

const CONTROLS: Control<Settings>[] = [
  { key: "side", label: "text sits (left to right)", min: 0, max: 1, step: 0.02 },
  { key: "levels", label: "number of contours", min: 10, max: 90, step: 1 },
  { key: "zoom", label: "map zoom", min: 0.5, max: 3, step: 0.05 },
  { key: "spacing", label: "dot spacing (px)", min: 2, max: 12, step: 0.5 },
  { key: "dot", label: "dot size (px)", min: 0.6, max: 3, step: 0.1 },
  { key: "strength", label: "dot strength", min: 0.05, max: 1, step: 0.05 },
  { key: "shade", label: "shading by height", min: 0, max: 1, step: 0.05 },
  { key: "glimmer", label: "glimmer", min: 0, max: 1, step: 0.05 },
  { key: "clearing", label: "clearing margin (px)", min: 0, max: 300, step: 10 },
  { key: "wander", label: "clearing edge wanders", min: 0, max: 1, step: 0.05 },
  { key: "rings", label: "rings around the text", min: 0, max: 10, step: 1 },
  { key: "hill", label: "hill under the pointer", min: 0, max: 1, step: 0.05 },
  { key: "travel", label: "travel on scroll", min: 0, max: 1, step: 0.05 },
  { key: "weight", label: "scroll friction", min: 0, max: 1, step: 0.05 },
  { key: "speed", label: "scroll speed", min: 0.2, max: 1.5, step: 0.05 },
  { key: "paper", label: "background", color: true },
  { key: "ink", label: "text and shading", color: true },
  { key: "line", label: "dots", color: true },
];

// The elevation map: 512 x 768 heights, about 32 km wide and 47 km tall,
// 347 m to 2010 m. Spruce Pine is near (292, 205).
const DEM_W = 512;
const DEM_H = 768;
const TOWN_X = 292;
const TOWN_Y = 205;

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

const CELL = 8; // size of a grid square in pixels

export default function TopoPage({ paragraphs, fx = false }: { paragraphs: string[]; fx?: boolean }) {
  const defaults = fx ? DEFAULTS_2 : DEFAULTS;
  const pageKey = fx ? "crucible-site:topo-2" : "crucible-site:topo";
  const [raw, setRaw] = useStored<Settings>(pageKey, defaults);
  // Colours are kept per theme and shared by both map views.
  const themed = useThemeColors<MapColors>("topo", MAP_BASE, "light");
  const s: Settings = { ...raw, ...themed.colors };
  // Which scroll preset is in play on Topo 2, and what each was left at.
  const [preset, setPreset] = useState("descent");
  useEffect(() => {
    const saved = readSaved<PresetStore>(PRESET_KEY);
    if (saved?.mode && PRESETS[saved.mode]) setPreset(saved.mode);
  }, []);
  const fxOf = (v: Settings) => Object.fromEntries(FX_KEYS.map((k) => [k, v[k]])) as Fx;
  const setS = (next: Settings) => {
    if (next === defaults) {
      themed.reset();
      setRaw(defaults);
      return;
    }
    const { paper, ink, line } = next;
    if (paper !== s.paper || ink !== s.ink || line !== s.line) themed.setColors({ paper, ink, line });
    if (fx && FX_KEYS.some((k) => next[k] !== s[k])) {
      const saved = readSaved<PresetStore>(PRESET_KEY) || {};
      writeSaved(PRESET_KEY, { mode: preset, slots: { ...saved.slots, [preset]: fxOf(next) } });
    }
    setRaw(next);
  };
  const pickPreset = (name: string) => {
    const saved = readSaved<PresetStore>(PRESET_KEY) || {};
    // Leaving a preset keeps its sliders as they are now.
    const slots = { ...saved.slots, [preset]: fxOf(s) };
    writeSaved(PRESET_KEY, { mode: name, slots });
    setPreset(name);
    setRaw({ ...raw, ...(slots[name] ?? PRESETS[name]) });
  };
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const coordRef = useRef<HTMLSpanElement>(null);
  const elevRef = useRef<HTMLSpanElement>(null);
  const sRef = useRef(s);
  sRef.current = s;

  useSmoothScroll(s.weight, s.speed);
  usePageColors(s.paper, s.ink);

  useEffect(() => {
    setShown(false);
    const t = setTimeout(() => setShown(true), reducedMotion() ? 0 : 1900);
    return () => clearTimeout(t);
  }, [run]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const column = columnRef.current!;
    const ctx = canvas.getContext("2d")!;
    const still = reducedMotion();
    let began = performance.now();
    let alive = true;

    // Read the elevation map. Each pixel holds a height in its red and green.
    let dem: Float32Array | null = null;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const c = document.createElement("canvas");
      c.width = DEM_W;
      c.height = DEM_H;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, DEM_W, DEM_H).data;
      const out = new Float32Array(DEM_W * DEM_H);
      for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / 65535;
      dem = out;
      began = performance.now();
      lastKey = "";
    };
    img.src = "/topo/spruce-pine-dem.png";
    const land = (u: number, v: number) => {
      const d = dem!;
      u = Math.min(DEM_W - 1.001, Math.max(0, u));
      v = Math.min(DEM_H - 1.001, Math.max(0, v));
      const i = u | 0, j = v | 0, fu = u - i, fv = v - j;
      const k = j * DEM_W + i;
      return (d[k] * (1 - fu) + d[k + 1] * fu) * (1 - fv) + (d[k + DEM_W] * (1 - fu) + d[k + DEM_W + 1] * fu) * fv;
    };

    let vw = 0, vh = 0, cols = 0, rows = 0;
    let field = new Float32Array(0);
    const shadeCanvas = document.createElement("canvas");
    const shadeCtx = shadeCanvas.getContext("2d")!;
    let shadeData: ImageData | null = null;
    let lastKey = "";
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      vw = window.innerWidth;
      vh = window.innerHeight;
      canvas.width = vw * dpr;
      canvas.height = vh * dpr;
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(vw / CELL) + 2;
      rows = Math.ceil(vh / CELL) + 2;
      field = new Float32Array(cols * rows);
      shadeCanvas.width = cols;
      shadeCanvas.height = rows;
      shadeData = shadeCtx.createImageData(cols, rows);
      lastKey = "";
    };
    resize();
    window.addEventListener("resize", resize);

    // The pointer, followed with a little lag so its hill glides.
    let mx = -9999, my = -9999, hx = -9999, hy = -9999;
    const move = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (hx < -9000) {
        hx = mx;
        hy = my;
      }
    };
    window.addEventListener("pointermove", move);

    // How fast the page is scrolling, 0 to 1. It rises quickly and settles slowly.
    let lastSy = window.scrollY;
    let lastNow = performance.now();
    let vel = 0;
    // The lowest and highest ground in view, eased so the tide moves smoothly.
    let seenLo = 0.2;
    let seenHi = 0.5;
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!dem || !shadeData) return;
      const cur = sRef.current;
      const t = (now - began) / 1000;
      const sy = window.scrollY;
      hx += (mx - hx) * 0.12;
      hy += (my - hy) * 0.12;
      const dt = Math.max(1, now - lastNow) / 1000;
      const target = still ? 0 : Math.min(1, Math.abs(sy - lastSy) / dt / 1300);
      vel += (target - vel) * (target > vel ? 0.22 : 0.035);
      if (vel < 0.002) vel = 0;
      lastSy = sy;
      lastNow = now;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const prog = maxScroll > 0 ? Math.min(1, Math.max(0, sy / maxScroll)) : 0;
      const box = column.getBoundingClientRect();
      const first = column.firstElementChild!.getBoundingClientRect();
      const lastEl = column.lastElementChild!.getBoundingClientRect();
      const rect = { left: box.left, right: box.right, top: first.top, bottom: lastEl.bottom };
      const grow = still ? 1 : Math.min(1, t / 4.2);
      const tick = still || cur.glimmer <= 0 ? 0 : Math.floor(t * 5);
      const key = `${sy.toFixed(1)}:${rect.left.toFixed(0)}:${vw}:${vh}:${grow.toFixed(3)}:${hx.toFixed(0)}:${hy.toFixed(0)}:${tick}:${vel.toFixed(3)}:${JSON.stringify(cur)}`;
      if (key === lastKey) return;
      lastKey = key;

      const n = Math.max(2, Math.round(cur.levels));
      const step = 1 / n;
      // Map pixels per screen pixel, and where the window sits on the map.
      // Descent: start high above the region and come down toward the town.
      const zBase = 0.25 / cur.zoom;
      const z = zBase * (1 + cur.descent * (0.5 - 1.1 * smooth(prog)));
      const u0 = TOWN_X - (vw * z) / 2;
      const v0 = TOWN_Y - vh * z * 0.3 + sy * cur.travel * zBase;
      // The text stands on a flat table, a few steps above the land beneath it.
      const cxs = (rect.left + rect.right) / 2;
      // Its height is kept midway between two contours so no line strays onto it.
      let base = (Math.floor(land(u0 + cxs * z, v0 + vh * 0.5 * z) / step) + 0.5) * step;
      // Tide: the waterline climbs from the lowest ground in view toward the
      // highest. The text always stays dry, so it ends up as an island.
      const water = cur.tide > 0 ? seenLo + (seenHi - seenLo) * (0.04 + 0.72 * cur.tide * smooth(prog)) : -1;
      if (base < water + step * 0.5) base = (Math.ceil(water / step) + 0.5) * step;
      let lo = 1;
      let hi = 0;
      const lift = cur.rings * step;
      const m = cur.clearing;
      const ringLen = 30 + m * 1.1;
      const hillH = cur.hill * 5 * step;
      const travelY = sy * cur.travel;
      const wander = cur.wander * (40 + m * 1.6);
      for (let j = 0; j < rows; j++) {
        const y = (j - 1) * CELL;
        const dy = Math.max(rect.top - y, y - rect.bottom, 0);
        for (let i = 0; i < cols; i++) {
          const x = (i - 1) * CELL;
          let h = land(u0 + x * z, v0 + y * z);
          if (h < lo) lo = h;
          if (h > hi) hi = h;
          const dx = Math.max(rect.left - x, x - rect.right, 0);
          // The edge of the clearing wanders with the land, so it never
          // reads as a box: in places the flat ground reaches further out.
          const wy = y + travelY;
          const w =
            Math.sin(x * 0.0083 + Math.sin(wy * 0.0061) * 2.1) * 0.55 +
            Math.sin(wy * 0.0117 + Math.sin(x * 0.0047 + 1.3) * 1.7) * 0.45;
          const d = Math.max(0, Math.hypot(dx, dy) + (w - 1) * 0.65 * wander);
          // Flat inside the block, the real land beyond the margin.
          const k = smooth((d - m * 0.15) / Math.max(1, m * 1.5));
          h = base + (h - base) * k;
          // The table's slope: rings that echo the shape of the text block.
          h += lift * Math.max(0, 1 - d / ringLen);
          if (hillH > 0) {
            const r2 = (x - hx) * (x - hx) + (y - hy) * (y - hy);
            if (r2 < 160000) h += hillH * Math.exp(-r2 / 16000) * k;
          }
          field[j * cols + i] = h;
        }
      }

      seenLo += (lo - seenLo) * 0.2;
      seenHi += (hi - seenHi) * 0.2;

      // The small label: where the middle of the window is on the real map,
      // and the height of the land under the pointer (or the middle).
      if (coordRef.current && elevRef.current) {
        const mu = u0 + (vw / 2) * z;
        const mv = v0 + (vh / 2) * z;
        const lon = ((1112 + mu / 128) / 4096) * 360 - 180;
        const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (1608 + mv / 128)) / 4096))) * 180) / Math.PI;
        const coord = `${lat.toFixed(4)}\u00b0 N  ${(-lon).toFixed(4)}\u00b0 W`;
        if (coordRef.current.textContent !== coord) coordRef.current.textContent = coord;
        const px = hx > -9000 ? hx : vw / 2;
        const py = hx > -9000 ? hy : vh / 2;
        const metres = Math.round(347 + land(u0 + px * z, v0 + py * z) * 1663);
        const elev = `${metres} M`;
        if (elevRef.current.textContent !== elev) elevRef.current.textContent = elev;
      }

      ctx.clearRect(0, 0, vw, vh);

      // Shading: every step of height is a touch darker (or lighter on dark).
      if (cur.shade > 0 || cur.tide > 0) {
        const n16 = parseInt(cur.ink.slice(1), 16);
        const r = (n16 >> 16) & 255, g = (n16 >> 8) & 255, b = n16 & 255;
        const dark = isDark(cur.paper);
        const ref = Math.floor((base + lift) / step);
        const per = cur.shade * 0.022 * 255;
        const o = shadeData.data;
        const wet = cur.tide * 34;
        for (let i = 0; i < field.length; i++) {
          const band = Math.floor(field[i] / step);
          const below = Math.min(16, Math.max(0, ref - band));
          let a = dark ? Math.max(0, 9 - below) * per * 0.8 : below * per;
          // Under the waterline the land takes one even tint.
          if (field[i] < water) a = dark ? wet * 0.9 : a * 0.35 + wet;
          o[i * 4] = r;
          o[i * 4 + 1] = g;
          o[i * 4 + 2] = b;
          o[i * 4 + 3] = a;
        }
        shadeCtx.putImageData(shadeData, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.globalAlpha = still ? 1 : smooth((t - 1.2) / 3);
        ctx.drawImage(shadeCanvas, -CELL * 1.5, -CELL * 1.5, cols * CELL, rows * CELL);
        ctx.globalAlpha = 1;
      }

      // On load the lines spread out from the middle of the text block.
      const cy = vh * 0.5;
      const far = Math.hypot(Math.max(cxs, vw - cxs), vh) * 1.15;
      const reach = far * (1 - Math.pow(1 - grow, 1.7));

      // Contours, as rows of dots. Every fifth line is a little heavier.
      const fine = new Path2D();
      const heavy = new Path2D();
      const glint = new Path2D();
      const sunk = new Path2D();
      const shore = new Path2D();
      // Relief: each contour lifts by its height while the page is moving.
      const rise = cur.relief * vel * 800;
      const shake = cur.loose * vel * 13;
      const gap = Math.max(1.5, cur.spacing);
      const ds = cur.dot;
      const chance = cur.glimmer * 0.07;
      let count = 0;
      const seg = (kind: number, L: number, ax: number, ay: number, bx: number, by: number) => {
        if (grow < 1 && Math.hypot((ax + bx) / 2 - cxs, (ay + by) / 2 - cy) > reach) return;
        const len = Math.hypot(bx - ax, by - ay);
        const dots = Math.max(1, Math.round(len / gap));
        for (let q = 0; q < dots; q++) {
          const f = (q + 0.5) / dots;
          let x = ax + (bx - ax) * f;
          let y = ay + (by - ay) * f - (L - base) * rise;
          count++;
          if (shake > 0) {
            // Loose sand: every dot is knocked a little way off its line.
            const r1 = (Math.imul(count, 1597334677) >>> 0) / 4294967296 - 0.5;
            const r2 = (Math.imul(count, 3812015801) >>> 0) / 4294967296;
            x += r1 * 2 * shake;
            y -= r2 * r2 * 2.4 * shake;
          }
          if (kind === 3) {
            const d3 = ds * 1.7;
            shore.rect(x - d3 / 2, y - d3 / 2, d3, d3);
            continue;
          }
          if (kind === 2) {
            sunk.rect(x - ds / 2, y - ds / 2, ds, ds);
            continue;
          }
          // A few dots catch the light for a moment, like grains of quartz.
          const roll = (Math.imul(count, 2654435761) + Math.imul(tick + 1, 40503)) >>> 0;
          if (roll / 4294967296 < chance) {
            const g2 = ds * 2.1;
            glint.rect(x - g2 / 2, y - g2 / 2, g2, g2);
          } else if (kind === 1) {
            const d2 = ds * 1.35;
            heavy.rect(x - d2 / 2, y - d2 / 2, d2, d2);
          } else {
            fine.rect(x - ds / 2, y - ds / 2, ds, ds);
          }
        }
      };
      for (let j = 0; j < rows - 1; j++) {
        const y0 = (j - 1) * CELL;
        for (let i = 0; i < cols - 1; i++) {
          const a = field[j * cols + i];
          const b = field[j * cols + i + 1];
          const c = field[(j + 1) * cols + i + 1];
          const d = field[(j + 1) * cols + i];
          const mn = Math.min(a, b, c, d);
          const mx2 = Math.max(a, b, c, d);
          const firstL = Math.ceil(mn / step);
          const lastL = Math.floor(mx2 / step);
          const x0 = (i - 1) * CELL;
          // One extra pass draws the shoreline at the waterline itself.
          const shoreHere = water > mn && water <= mx2;
          for (let q = firstL; q <= lastL + (shoreHere ? 1 : 0); q++) {
            const isShore = q > lastL;
            const L = isShore ? water : q * step;
            const pts: number[] = [];
            if (a < L !== b < L) pts.push(x0 + ((L - a) / (b - a)) * CELL, y0);
            if (b < L !== c < L) pts.push(x0 + CELL, y0 + ((L - b) / (c - b)) * CELL);
            if (d < L !== c < L) pts.push(x0 + ((L - d) / (c - d)) * CELL, y0 + CELL);
            if (a < L !== d < L) pts.push(x0, y0 + ((L - a) / (d - a)) * CELL);
            const kind = isShore ? 3 : L < water ? 2 : q % 5 === 0 ? 1 : 0;
            if (pts.length >= 4) seg(kind, L, pts[0], pts[1], pts[2], pts[3]);
            if (pts.length === 8) seg(kind, L, pts[4], pts[5], pts[6], pts[7]);
          }
        }
      }
      ctx.fillStyle = cur.line;
      ctx.globalAlpha = cur.strength * 0.6;
      ctx.fill(fine);
      ctx.globalAlpha = Math.min(1, cur.strength * 1.15);
      ctx.fill(heavy);
      ctx.globalAlpha = cur.strength * 0.22;
      ctx.fill(sunk);
      ctx.globalAlpha = 1;
      ctx.fill(shore);
      ctx.fill(glint);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
    };
  }, [run]);

  const dark = isDark(s.paper);
  return (
    <div className={`topo${shown ? " shown" : ""}`}>
      <canvas className="contours" ref={canvasRef} aria-hidden />
      <div
        className="column column-topo"
        ref={columnRef}
        style={{ marginLeft: `calc((100vw - min(400px, 100vw - 32px)) * ${0.06 + s.side * 0.88})` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="logo"
          src={dark ? "/mark/lockup-horizontal-light.svg" : "/mark/lockup-horizontal-dark.svg"}
          alt="Crucible"
        />
        {paragraphs.map((p, i) => (
          <p key={i} style={{ "--i": i } as React.CSSProperties}>
            {p}
          </p>
        ))}
      </div>
      <div className="map-label" aria-hidden>
        <span>Spruce Pine, North Carolina</span>
        <span ref={coordRef}>35.9154° N  82.0646° W</span>
        <span ref={elevRef}>&nbsp;</span>
      </div>
      <Panel
        current={fx ? "/topography-2" : "/topography"}
        controls={fx ? [...FX_CONTROLS, ...CONTROLS] : CONTROLS}
        value={s}
        onChange={setS}
        defaults={defaults}
        onReplay={() => {
          window.scrollTo(0, 0);
          setRun((r) => r + 1);
        }}
        extra={
          <>
          <ThemeButtons current={themed.theme} onPick={themed.pick} />
          <div className="actions">
            {fx &&
              Object.keys(PRESETS).map((name) => (
                <button key={name} className={name === preset ? "on" : ""} onClick={() => pickPreset(name)}>
                  {name}
                </button>
              ))}
          </div>
          </>
        }
      />
    </div>
  );
}
