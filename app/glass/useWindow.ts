"use client";

import { RefObject, useEffect, useRef } from "react";
import { draw, paint, Layers, Settings, Stroke } from "./engine";
import { opening, through as partway } from "../cathedral/opening";

const HEX = /^#[0-9a-f]{6}$/i;
export const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Keeps a canvas showing the window. Redraws when the settings change, and
// plays the draw-in each time `play` changes to a new number other than 0.
export function useWindow(canvas: RefObject<HTMLCanvasElement | null>, layers: Layers | null, look: Settings, ink: string, paper: string, play: number, seconds = 2.2) {
  const run = useRef({ raf: 0, start: 0, played: 0 });
  useEffect(() => {
    const c = canvas.current;
    if (!c || !layers || !HEX.test(ink)) return;
    const state = run.current;
    const id = requestAnimationFrame(() => {
      if (c.width !== layers.w || c.height !== layers.h) {
        c.width = layers.w;
        c.height = layers.h;
      }
      const g = c.getContext("2d")!;
      const img = g.createImageData(layers.w, layers.h);
      const F = draw(layers, look);
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (state.played !== play && play !== 0) {
        state.played = play;
        if (!still) state.start = performance.now();
      }
      // The finished window is painted once, onto a spare canvas.
      paint(F, rgb(ink), HEX.test(paper) ? rgb(paper) : null, 1, img);
      const full = document.createElement("canvas");
      full.width = layers.w;
      full.height = layers.h;
      full.getContext("2d")!.putImageData(img, 0, 0);
      // Tell the page the window is ready, so the opening can start as one piece.
      window.dispatchEvent(new Event("crucible-window-drawn"));
      cancelAnimationFrame(state.raf);
      if (!state.start) {
        g.clearRect(0, 0, layers.w, layers.h);
        g.drawImage(full, 0, 0);
        return;
      }
      state.start = performance.now() + 150 * (seconds / 2.2); // a beat after the cathedral starts to rise

      // The draw-in: each line of the drawing is drawn along its own path, in
      // turn and overlapping, and shows the finished window where it has
      // passed. Then the leading and the glass fade in.
      const k = layers.k;
      const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const topOf = (s: { pts: Float32Array }) => {
        let m = Infinity;
        for (let i = 1; i < s.pts.length; i += 2) m = Math.min(m, s.pts[i]);
        return m;
      };
      // Every line is drawn from its top end down.
      const down = (s: Stroke): Stroke => {
        const n = s.pts.length / 2;
        if (s.pts[1] <= s.pts[(n - 1) * 2 + 1]) return s;
        const pts = new Float32Array(s.pts.length);
        for (let i = 0; i < n; i++) {
          pts[i * 2] = s.pts[(n - 1 - i) * 2];
          pts[i * 2 + 1] = s.pts[(n - 1 - i) * 2 + 1];
        }
        return { ...s, pts };
      };
      // The frame first, drawn from a picture of the frame alone so that it
      // comes in clean. Then the stone and the symbol together, from the top
      // of the window down, each line starting before the last has finished.
      // The leading fades in at the end.
      const frame = layers.frameAt >= 0 ? layers.strokes[layers.frameAt] : undefined;
      const detail = layers.strokes.filter((s) => s !== frame && s.kind !== "lead").map(down).sort((a, b) => topOf(a) - topOf(b));
      const H = layers.h - layers.pad * 2;
      const plan = detail.map((s) => ({ s, from: 0.24 + 0.24 * Math.max(0, (topOf(s) - layers.pad) / H), len: 0.3 }));
      const spare = () => {
        const c = document.createElement("canvas");
        c.width = layers.w;
        c.height = layers.h;
        return c;
      };
      const pic = (S: Layers) => {
        const c = spare();
        const d = g.createImageData(layers.w, layers.h);
        paint(draw(S, { ...look, leadTone: 0, glass: 0 }), rgb(ink), null, 1, d);
        c.getContext("2d")!.putImageData(d, 0, 0);
        return c;
      };
      const lines = pic(layers); // the window without its leading or glass
      const alone = frame && layers.frame ? pic({ ...layers, stone: layers.frame, symbol: null, lead: null }) : lines;
      const A = spare();
      const B = spare();
      const a = A.getContext("2d")!;
      const b = B.getContext("2d")!;
      const lay = (c: CanvasRenderingContext2D, s: Stroke, p: number, alpha: number) => {
        if (p <= 0 || alpha <= 0) return;
        const n = s.pts.length / 2;
        const upto = Math.max(1, Math.floor((n - 1) * p));
        c.globalAlpha = alpha;
        c.lineCap = "round";
        c.lineJoin = "round";
        c.lineWidth = s.width + 26 * k;
        c.beginPath();
        c.moveTo(s.pts[0], s.pts[1]);
        for (let i = 1; i <= upto; i++) c.lineTo(s.pts[i * 2], s.pts[i * 2 + 1]);
        c.stroke();
        if (s.fill && p > 0.6) {
          c.globalAlpha = alpha * ((p - 0.6) / 0.4);
          c.beginPath();
          c.moveTo(s.pts[0], s.pts[1]);
          for (let i = 1; i < n; i++) c.lineTo(s.pts[i * 2], s.pts[i * 2 + 1]);
          c.fill();
        }
        c.globalAlpha = 1;
      };
      const through = (c: CanvasRenderingContext2D, img: HTMLCanvasElement) => {
        c.globalCompositeOperation = "source-in";
        c.drawImage(img, 0, 0);
        c.globalCompositeOperation = "source-over";
      };
      const tick = () => {
        const t = opening.on ? partway("window") : Math.max(0, Math.min(1, (performance.now() - state.start) / (seconds * 1000)));
        const fp = ease(t / 0.36);
        // The frame alone gives way to the frame as it sits among the other lines.
        const join = ease((t - 0.3) / 0.3);
        a.clearRect(0, 0, layers.w, layers.h);
        b.clearRect(0, 0, layers.w, layers.h);
        if (frame) {
          lay(a, frame, fp, 1);
          through(a, alone);
          lay(b, frame, fp, join);
        }
        for (const { s, from, len } of plan) lay(b, s, ease((t - from) / len), 1);
        through(b, lines);
        g.globalAlpha = 1;
        g.clearRect(0, 0, layers.w, layers.h);
        g.globalAlpha = 1 - join;
        g.drawImage(A, 0, 0);
        g.globalAlpha = 1;
        g.drawImage(B, 0, 0);
        // The leading, the glass and everything between the lines fade in at the end.
        const rest = ease((t - 0.62) / 0.38);
        if (rest > 0) {
          g.globalAlpha = rest;
          g.drawImage(full, 0, 0);
          g.globalAlpha = 1;
        }
        // On the homepage the timeline holds the clock, so it keeps listening for a scrub or a replay.
        if (t < 1 || opening.on) state.raf = requestAnimationFrame(tick);
        else state.start = 0;
      };
      tick();
    });
    return () => {
      cancelAnimationFrame(id);
      cancelAnimationFrame(state.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, look, ink, paper, play]);
}
