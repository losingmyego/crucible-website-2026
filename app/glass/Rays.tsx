"use client";

import { useEffect, useRef } from "react";
import { Outline } from "./nave";
import { opening, through } from "../cathedral/opening";

export type RayLook = {
  rays: number; // strength of the shafts of light, 0 = off
  rayCount: number; // how many shafts
  raySpread: number; // how widely they fan out
  rayLength: number; // how far they reach, as a share of the screen height
  rayShade: number; // how much the room away from the light is darkened, so the light shows
  rayMove: number; // how much the shafts drift and breathe
  rayColor: "white" | "warm";
};

const rnd = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Shafts of light coming through the window toward you, with the room around
// them shaded a little so they show on a light page.
//
// `intro` plays them in: 0 means wait and show nothing, a number is the length
// of the page's opening (1 is the set pace), undefined shows them at once. The
// room shades first; the shafts come last, opening out from the middle of the
// window to the sides while they reach down the floor.
export default function Rays({ outline, look, ink, top, size, dark, intro }: { outline: Outline | null; look: RayLook; ink: string; top: number; size: number; dark: boolean; intro?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const began = useRef(0);
  const pace = useRef(intro);
  pace.current = intro;
  useEffect(() => {
    if (intro && !began.current) began.current = performance.now();
  }, [intro]);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !outline) return;
    const g = c.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = look.rayColor === "warm" ? "255,214,176" : "255,255,255";
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(ink.trim());
    const shadeRgb = dark ? "0,0,0" : m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : "26,26,23";
    let raf = 0;
    let drawn = false;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (still && drawn) return;
      drawn = true;
      // Half size: the canvas is blurred, so detail would be wasted.
      const W = Math.round(window.innerWidth / 2);
      const H = Math.round(window.innerHeight / 2);
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      g.clearRect(0, 0, W, H);
      // How far in the room shade and the shafts are, 0 to 1.
      const o = pace.current;
      const since = o === undefined || still ? Infinity : began.current ? (now - began.current) / 1000 / (o || 1) : -1;
      if (since < 0) return;
      const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
      const shadeIn = opening.on ? ease(through("shade")) : ease((since - 0.2) / 1.8);
      const sweep = opening.on ? through("rays") : (since - 3.1) / 3.2; // the shafts are the last thing to arrive
      const tall = size * H;
      const open = outline.ratio * tall; // height of the opening
      const cx = W / 2 + outline.dx * tall;
      const sill = top * H + outline.sill * tall;
      const hw = outline.hw * open;
      const time = still ? 0 : (now / 1000) * look.rayMove;

      if (look.rayShade > 0) {
        const cy = sill - open * 0.45;
        const shade = g.createRadialGradient(cx, cy, open * 0.35, cx, cy, Math.hypot(W, H) * 0.62);
        shade.addColorStop(0, `rgba(${shadeRgb},0)`);
        shade.addColorStop(0.45, `rgba(${shadeRgb},${look.rayShade * 0.22 * shadeIn})`);
        shade.addColorStop(1, `rgba(${shadeRgb},${look.rayShade * 0.5 * shadeIn})`);
        g.fillStyle = shade;
        g.fillRect(0, 0, W, H);
      }
      if (look.rays <= 0 || sweep <= 0) return;
      // The shafts fan out from a point above the window; at full spread, from the symbol.
      const oy = sill - open * 1.1;
      const n = Math.round(look.rayCount);
      for (let k = 0; k < n; k++) {
        const u1 = (rnd(k, 1) * 2 - 1) * 0.96 + Math.sin(time * 0.21 + k * 1.7) * 0.04;
        // Each shaft has its own moment: the ones nearest the middle first.
        const p = ease((sweep - Math.abs(u1) * 0.35) / 0.65);
        if (p <= 0) continue;
        // It starts near the middle and swings out to its place...
        const u = u1 * (0.25 + 0.75 * p);
        const w = hw * (0.02 + 0.16 * rnd(k, 2) * rnd(k, 5));
        const ys = sill - open * (0.04 + 0.5 * rnd(k, 3));
        const ax = cx + u * hw - w;
        const bx = cx + u * hw + w;
        // ...while it grows down from the window.
        const L = H * look.rayLength * (0.55 + 0.9 * rnd(k, 4)) * (0.2 + 0.8 * p);
        const end = (x: number): [number, number] => {
          const dx = (x - cx) * (1 + look.raySpread * 3.5);
          const dy = ys - oy;
          const d = Math.hypot(dx, dy);
          return [x + (dx / d) * L, ys + (dy / d) * L];
        };
        const [ex, ey] = end(ax);
        const [fx, fy] = end(bx);
        const a = p * Math.min(1, look.rays * (dark ? 0.35 : 1) * (0.25 + 0.75 * rnd(k, 6)) * (0.6 + 0.4 * Math.sin(time * (0.25 + rnd(k, 7) * 0.5) + k * 2.3)));
        const grad = g.createLinearGradient((ax + bx) / 2, ys, (ex + fx) / 2, (ey + fy) / 2);
        grad.addColorStop(0, `rgba(${light},${a})`);
        grad.addColorStop(0.35, `rgba(${light},${a * 0.6})`);
        grad.addColorStop(1, `rgba(${light},0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(ax, ys);
        g.lineTo(bx, ys);
        g.lineTo(fx, fy);
        g.lineTo(ex, ey);
        g.closePath();
        g.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [outline, look, ink, top, size, dark]);
  return <canvas ref={canvas} className="rays-canvas" />;
}
