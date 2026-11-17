"use client";

import { useEffect, useRef, useState } from "react";
import { readSaved } from "../lab";
import { loadWindow, Layers } from "./engine";
import { GLASS_KEY, GLASS_LOOK, Look, place, UPLOAD_KEY } from "./look";
import { useWindow } from "./useWindow";
import WindowEtch from "./WindowEtch";

// The window as it is currently set in the window tool (/tool), for use on
// other pages. It reads the tool's saved settings from this browser, or the
// tool's defaults for a first-time visitor, and draws itself in on load.
export default function WindowCanvas({ ink, paper, className, play = 1, seconds, onLook, onLayers }: { seconds?: number; ink: string; paper: string; className?: string; play?: number; onLook?: (look: Look) => void; onLayers?: (layers: Layers) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<Layers | null>(null);
  const [look, setLook] = useState<Look>(GLASS_LOOK);
  useEffect(() => {
    const saved = { ...GLASS_LOOK, ...(readSaved<Partial<Look>>(GLASS_KEY) || {}) };
    setLook(saved);
    onLook?.(saved);
    let off = false;
    (async () => {
      let text = "";
      if (saved.frame === "upload") {
        try {
          text = JSON.parse(localStorage.getItem(UPLOAD_KEY) || "{}").text || "";
        } catch {}
      }
      if (!text) text = await (await fetch(saved.frame === "upload" ? GLASS_LOOK.frame : saved.frame)).text();
      const L = await loadWindow(text, 1000);
      if (!off) {
        setLayers(L);
        onLayers?.(L);
      }
    })().catch(() => {});
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useWindow(canvas, layers, look, ink, paper, play, seconds);
  return (
    <>
      {look.winEtch > 0 && <WindowEtch layers={layers} look={look} ink={ink} className={className} style={place(layers)} />}
      <canvas ref={canvas} className={className} style={place(layers)} />
    </>
  );
}
