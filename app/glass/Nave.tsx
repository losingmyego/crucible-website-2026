"use client";

import { useEffect, useRef } from "react";
import { drawNave, NaveLook, Outline } from "./nave";
import { opening, through } from "../cathedral/opening";

// The drawn cathedral, filling the screen behind the window. `top` and `size`
// place the window (shares of the screen height). `walk` is how many bays you
// have walked toward the window; `scroll` adds to it as the page scrolls.
export default function Nave({ outline, look, ink, strength, top, size, walk = 0, scroll = 0, play = 0 }: { outline: Outline | null; look: NaveLook; ink: string; strength: number; top: number; size: number; walk?: number; scroll?: number; play?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !outline) return;
    const g = c.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = "";
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(window.innerWidth * dpr);
      const Ht = Math.round(window.innerHeight * dpr);
      const moved = walk + (still ? 0 : (scroll * window.scrollY) / window.innerHeight);
      // On the homepage the opening's timeline sketches the cathedral in.
      const drawn = opening.on ? through("cathedral") : 1;
      const key = [W, Ht, moved.toFixed(4), drawn.toFixed(4)].join(":");
      if (key === last) return;
      last = key;
      if (c.width !== W || c.height !== Ht) {
        c.width = W;
        c.height = Ht;
      }
      const tall = size * Ht;
      drawNave(g, outline, look, { width: W, height: Ht, cx: W / 2 + outline.dx * tall, sillY: top * Ht + outline.sill * tall, H: outline.ratio * tall, px: dpr }, ink, strength, moved, drawn);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [outline, look, ink, strength, top, size, walk, scroll, play]);
  return (
    <div className="nave-rise" data-play={play}>
      <canvas ref={canvas} className="nave" />
    </div>
  );
}
