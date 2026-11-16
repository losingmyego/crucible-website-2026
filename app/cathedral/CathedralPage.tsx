"use client";

import { useEffect, useRef, useState } from "react";
import SandText, { sandNeck } from "../SandText";
import Rays from "../glass/Rays";
import { isDark, useStored } from "../lab";
import WindowCanvas from "../glass/WindowCanvas";
import { GLASS_LOOK } from "../glass/look";
import Nave from "../glass/Nave";
import { outlineOf, Outline } from "../glass/nave";

/**
 * The cathedral hero (after the review with Meltem, 2026-11-10).
 *
 * Three layers, all fixed to the window while the text scrolls:
 *  1. A drawn cathedral, kept faint.
 *  2. Neesh's gothic window, with the symbol as its tracery, drawn by the
 *     window tool.
 *  3. The text, which turns to dust at the sill and rises into the window.
 *
 * The window is drawn live, as it is set in the window tool (/tool).
 */

type Look = {
  walk: number; // how far the cathedral comes toward you as you scroll
  align: "left" | "justified"; // how the lines of text are set
  font: "sans" | "mono"; // the text face. Sans is a system face, a stand-in only.
  textSize: number; // in pixels
  open: number; // length of the opening: 1 is the set pace, 2 twice as long
  scrim: number; // strength of the shade rising from the bottom of the screen, behind the text
  scrimHeight: number; // how far up the screen it reaches
  scrimTone: "page" | "dark"; // the page colour, or black
  textWidth: number; // width of the column of text, in pixels
};

// Neesh's settings as of 2026-11-16.
const LOOK: Look = { walk: 0.5, font: "sans", align: "left", open: 1.2, textSize: 15, textWidth: 370, scrim: 0.14, scrimHeight: 0.5, scrimTone: "page" };
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

// A soft drone with slow voices, made in the browser. A stand-in for a real
// recording of chant, which would replace it.
function useChant() {
  const [on, setOn] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const toggle = () => {
    if (on) {
      stop.current?.();
      stop.current = null;
      setOn(false);
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const master = ac.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.22, ac.currentTime + 4);
    // A long hall: decaying noise as the echo.
    const len = ac.sampleRate * 6;
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const hall = ac.createConvolver();
    hall.buffer = buf;
    const wet = ac.createGain();
    wet.gain.value = 0.9;
    const dry = ac.createGain();
    dry.gain.value = 0.25;
    master.connect(dry).connect(ac.destination);
    master.connect(hall).connect(wet).connect(ac.destination);
    const scale = [146.83, 164.81, 174.61, 196.0, 220.0, 261.63]; // D dorian, around D3
    const timers: ReturnType<typeof setTimeout>[] = [];
    const voice = (start: number, level: number, moves: boolean) => {
      const osc = ac.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = start;
      const vib = ac.createOscillator();
      vib.frequency.value = 4.6 + Math.random();
      const vibGain = ac.createGain();
      vibGain.gain.value = start * 0.004;
      vib.connect(vibGain).connect(osc.frequency);
      const out = ac.createGain();
      out.gain.value = level;
      // Two bands shape the tone into an open "ah".
      for (const [f, q, g] of [[640, 6, 1], [1080, 8, 0.5], [2500, 9, 0.12]] as const) {
        const band = ac.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = f;
        band.Q.value = q;
        const bg = ac.createGain();
        bg.gain.value = g;
        osc.connect(band).connect(bg).connect(out);
      }
      out.connect(master);
      osc.start();
      vib.start();
      if (moves) {
        let at = scale.indexOf(start);
        const step = () => {
          at = Math.max(0, Math.min(scale.length - 1, at + (Math.random() < 0.5 ? -1 : 1)));
          osc.frequency.setTargetAtTime(scale[at], ac.currentTime, 0.35);
          timers.push(setTimeout(step, 2600 + Math.random() * 3800));
        };
        timers.push(setTimeout(step, 3000 + Math.random() * 3000));
      }
      return () => {
        osc.stop();
        vib.stop();
      };
    };
    const ends = [voice(73.42, 0.5, false), voice(146.83, 0.45, false), voice(220.0, 0.3, true), voice(174.61, 0.22, true)];
    stop.current = () => {
      timers.forEach(clearTimeout);
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(0, ac.currentTime, 0.4);
      setTimeout(() => {
        ends.forEach((e) => e());
        ac.close();
      }, 1600);
    };
    setOn(true);
  };
  return { on, toggle };
}

function Backdrop({ look, replay }: { look: Look; replay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(false);
  const [ink, setInk] = useState("#1a1a17");
  const [paper, setPaper] = useState("#e8e8e3");
  const [line, setLine] = useState("#1a1a17");
  // The page colours are set on the document by the sand text; follow them.
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setDark(isDark(cs.getPropertyValue("--paper").trim() || "#e8e8e3"));
      setPaper(cs.getPropertyValue("--paper").trim() || "#e8e8e3");
      setInk(cs.getPropertyValue("--ink").trim() || "#1a1a17");
      setLine(cs.getPropertyValue("--line").trim() || cs.getPropertyValue("--ink").trim() || "#1a1a17");
    };
    read();
    const watch = new MutationObserver(read);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => watch.disconnect();
  }, []);
  // Scrolling walks you a little way toward the window.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = Math.min(1, window.scrollY / (window.innerHeight * 2.5));
      ref.current?.style.setProperty("--walk", String(t));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Drawn in the browser only, so the server and the browser never disagree on a decimal.
  // Size, position and light come from the window tool.
  const [glass, setGlass] = useState(GLASS_LOOK);
  const [outline, setOutline] = useState<Outline | null>(null);
  // The dust rises into the window and fades out inside it.
  useEffect(() => {
    sandNeck.y = glass.top + glass.size * glass.dustEnd;
    sandNeck.w = outline ? 2 * outline.hw * outline.ratio * glass.size * 0.8 : 0;
    sandNeck.loose = glass.dustLoose;
    return () => {
      sandNeck.y = 0;
      sandNeck.w = 0;
      sandNeck.loose = 0;
    };
  }, [glass.top, glass.size, glass.dustEnd, glass.dustLoose, outline]);
  // The opening starts when the window has been drawn, so every part moves together.
  const [go, setGo] = useState(false);
  useEffect(() => {
    const start = () => setGo(true);
    window.addEventListener("crucible-window-drawn", start);
    const late = setTimeout(start, 5000);
    return () => {
      window.removeEventListener("crucible-window-drawn", start);
      clearTimeout(late);
    };
  }, []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return (
    <div
      className={`cathedral opening${go ? " go" : ""}${dark ? " dark" : ""}`}
      aria-hidden
      ref={ref}
      style={{ "--win-top": `${glass.top * 100}vh`, "--win-h": `${glass.size * 100}vh`, "--faint": glass.cathedral, "--light": glass.light, "--walk-by": look.walk, "--o": look.open } as React.CSSProperties}
    >
      {glass.cathedral > 0 && <Nave outline={outline} look={glass} ink={line} strength={glass.cathedral} top={glass.top} size={glass.size} walk={glass.walk} scroll={glass.walkScroll} play={1} />}
      <div className="beam" />
      {(glass.rays > 0 || glass.rayShade > 0) && <Rays outline={outline} look={glass} ink={ink} top={glass.top} size={glass.size} dark={dark} />}
      {look.scrim > 0 && (
        <div
          className="scrim"
          style={{
            height: `${look.scrimHeight * 100}vh`,
            opacity: look.scrim,
            background: `linear-gradient(to top, ${look.scrimTone === "dark" ? "#000" : paper} 0%, ${look.scrimTone === "dark" ? "#000" : paper} 25%, transparent 100%)`,
          }}
        />
      )}
      <WindowCanvas ink={line} paper={paper} className="win-canvas" play={1} seconds={2.2 * look.open} onLook={setGlass} onLayers={(L) => setOutline(outlineOf(L))} />
    </div>
  );
}

export default function CathedralPage({ paragraphs }: { paragraphs: string[] }) {
  const [look, setLook] = useStored<Look>("crucible-site:home-look", LOOK);
  const [replay, setReplay] = useState(0);
  const chant = useChant();
  const set = (patch: Partial<Look>) => setLook({ ...look, ...patch });

  // The text face is set on the document so the sand is cut from the same letters.
  useEffect(() => {
    const root = document.documentElement;
    if (look.font === "sans") root.style.setProperty("--text-font", SANS);
    else root.style.removeProperty("--text-font");
    // Justified text in the sans face keeps its normal word spaces; the mono face is tightened a little.
    root.style.setProperty("--text-align", look.align === "left" ? "left" : "justify");
    root.style.setProperty("--text-hyphens", "none"); // words are never broken across lines here
    root.style.setProperty("--text-word", "nowrap");
    root.style.setProperty("--text-space", look.align === "justified" && look.font === "mono" ? "-0.18em" : "0em");
    root.style.setProperty("--o", String(look.open));
    root.style.setProperty("--text-size", `${look.textSize}px`);
    root.style.setProperty("--text-width", `${look.textWidth}px`);
    return () => {
      for (const k of ["--text-font", "--text-size", "--text-width", "--text-align", "--text-hyphens", "--text-word", "--text-space", "--o"]) root.style.removeProperty(k);
    };
  }, [look.font, look.align, look.textSize, look.textWidth, look.open]);

  const slider = (key: keyof Look, label: string, min: number, max: number, step: number) => (
    <label>
      <span>
        {label} <b>{Number(look[key]).toFixed(2)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={Number(look[key])} onChange={(e) => set({ [key]: Number(e.target.value) })} />
    </label>
  );
  const extra = (
    <div className="group">
      <p className="head">window</p>
      <p className="note">The window, its size and place, the cathedral and the light are set in the window tool.</p>
      {slider("walk", "walk in on scroll", 0, 1, 0.05)}
      {slider("open", "opening length (1 = set pace)", 0.4, 2.5, 0.05)}
      {slider("scrim", "scrim behind the text (0 = off)", 0, 1, 0.01)}
      {slider("scrimHeight", "scrim height", 0.1, 1, 0.01)}
      <div className="actions">
        {(["page", "dark"] as const).map((f) => (
          <button key={f} className={look.scrimTone === f ? "on" : ""} onClick={() => set({ scrimTone: f })}>
            {f === "page" ? "scrim: page colour" : "scrim: darker"}
          </button>
        ))}
      </div>
      {slider("textSize", "text size (px)", 10, 28, 0.5)}
      {slider("textWidth", "text column width (px)", 280, 900, 10)}
      <div className="actions">
        {(["sans", "mono"] as const).map((f) => (
          <button key={f} className={look.font === f ? "on" : ""} onClick={() => set({ font: f })}>
            {f} text
          </button>
        ))}
      </div>
      <div className="actions">
        {(["left", "justified"] as const).map((f) => (
          <button key={f} className={look.align === f ? "on" : ""} onClick={() => set({ align: f })}>
            {f}
          </button>
        ))}
      </div>
      <div className="actions">
        <button onClick={() => setReplay((n) => n + 1)}>replay load</button>
        <button onClick={() => setLook(LOOK)}>reset look</button>
      </div>
      <p className="head">dust</p>
    </div>
  );

  return (
    <>
      <header className="cathedral-bar">
        {/* Placeholder labels only, to show a header can sit over the hero. */}
        <nav>
          <span>Portfolio</span>
          <span>Research</span>
          <span>Team</span>
        </nav>
        <button onClick={chant.toggle} aria-pressed={chant.on}>
          Sound {chant.on ? "on" : "off"}
        </button>
      </header>
      <SandText
        paragraphs={paragraphs}
        variant={{
          name: "home",
          href: "/",
          backdrop: <Backdrop key={replay} look={look} replay={replay} />,
          extra,
        }}
      />
    </>
  );
}
