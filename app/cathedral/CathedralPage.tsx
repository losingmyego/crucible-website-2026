"use client";

import SiteNav from "../site/SiteNav";
import GlassFx, { fxOn } from "../glass/GlassFx";
import type { Layers } from "../glass/engine";
import OpeningTimeline from "./OpeningTimeline";

import { useEffect, useRef, useState } from "react";
import SandText, { sandNeck } from "../SandText";
import Rays from "../glass/Rays";
import { SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { Fold, SKIP_GATE, isDark, isWorkingCopy, readSaved, useStored, writeSaved } from "../lab";
import WindowCanvas from "../glass/WindowCanvas";
import { GLASS_KEY, GLASS_LOOK } from "../glass/look";
import Nave from "../glass/Nave";
import Etched from "../glass/Etched";
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
  align: "left" | "center" | "justified"; // how the lines of text are set
  font: "semplicita" | "asta" | "cantarell" | "times" | "sans" | "mono"; // the text face. Asta Sans and Cantarell are served with the site; Times and sans are system faces.
  wrap: "normal" | "tidy" | "even"; // how lines break: as they fall, avoiding short last lines, or all lines near the same length
  textWeight: number; // Asta Sans only: its weight, 300 to 800
  brandWeight: number; // Semplicita only: 300 light, 400 regular, 500 medium, 700 bold
  textSize: number; // in pixels
  textLine: number; // line height, as a multiple of the text size
  textGap: number; // space between paragraphs, as a multiple of the text size
  navSize: number; // the header links, in px
  headSize: number; // section headers in the text, in px
  labelTrack: number; // letter spacing of both, in px
  tilt?: number; // perspective on the text: how much larger it is at the bottom of the screen, in percent
  textTrack: number; // letter spacing, in hundredths of the text size (0 = as the face is drawn)
  open: number; // length of the opening: 1 is the set pace, 2 twice as long
  scrim: number; // strength of the shade rising from the bottom of the screen, behind the text
  scrimHeight: number; // how far up the screen it reaches
  scrimTone: "page" | "dark" | "custom"; // the page colour, black, or a colour of its own
  scrimColor: string; // the colour used when the tone is custom
  scrimShape: "linear" | "radial"; // a band rising from the bottom, or a half circle sitting on the bottom edge
  scrimSolid: number; // gradient stop: how far the full colour holds, 0 to 1
  scrimEnd: number; // gradient stop: where it has faded to nothing, 0 to 1
  scrimWide: number; // half circle only: its width, in screen widths
  textWidth: number; // width of the column of text, in pixels
};

// Neesh's settings as of 2026-11-16.
const LOOK: Look = { walk: 0.5, font: "asta", textWeight: 350, brandWeight: 400, align: "left", wrap: "tidy", open: 1.2, textSize: 15, textLine: 1.6, textGap: 1.8, textTrack: 0, navSize: 12, headSize: 13, labelTrack: 0.5, tilt: 4, textWidth: 370, scrim: 0.14, scrimHeight: 0.5, scrimTone: "page", scrimColor: "#2a1c15", scrimShape: "linear", scrimSolid: 0.25, scrimEnd: 1, scrimWide: 1.2 };
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const SEMPLICITA = '"Semplicita Pro", "Helvetica Neue", Arial, sans-serif'; // the brand face, served from public/fonts
const ASTA = '"Asta Sans Variable", "Helvetica Neue", Arial, sans-serif';
const CANTARELL = 'Cantarell, "Helvetica Neue", Arial, sans-serif';
const TIMES = '"Times New Roman", Times, serif';

// A soft drone with slow voices, made in the browser. A stand-in for a real
// recording of chant, which would replace it.
// The sound starts with the page. A browser will not let a page make sound
// until the visitor has clicked, tapped or pressed a key, so it waits for the
// first of those and then fades in. Turning it off is remembered.
const SOUND_KEY = "crucible-site:sound";
function useChant() {
  const [on, setOn] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  // Called from the visitor's press on "enter", which is what lets a browser play sound.
  const begin = () => {
    if (!readSaved<{ off?: boolean }>(SOUND_KEY)?.off) start();
  };
  const toggle = () => {
    if (on) {
      stop.current?.();
      stop.current = null;
      setOn(false);
      writeSaved(SOUND_KEY, { off: true });
      return;
    }
    writeSaved(SOUND_KEY, { off: false });
    start();
  };
  const start = () => {
    if (stop.current) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const wake = () => {
      if (ac.state === "suspended") ac.resume();
    };
    const gestures = ["pointerdown", "keydown", "touchstart"] as const;
    gestures.forEach((g) => window.addEventListener(g, wake, { passive: true }));
    wake();
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
      gestures.forEach((g) => window.removeEventListener(g, wake));
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
  return { on, toggle, begin };
}

type Dust = { dustEnd: number; dustLoose: number };
function Backdrop({ look, replay, dust }: { look: Look; replay: number; dust: Dust | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(false);
  const [ink, setInk] = useState("#1a1a17");
  const [paper, setPaper] = useState("#e8e8e3");
  const [line, setLine] = useState("#1a1a17");
  const [nave, setNave] = useState("#1a1a17"); // the cathedral's lines
  const [rays, setRays] = useState(""); // the shafts of light; empty = automatic
  const [shade, setShade] = useState(""); // the darkening toward the edges; empty = automatic
  // The page colours are set on the document by the sand text; follow them.
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setDark(isDark(cs.getPropertyValue("--paper").trim() || "#e8e8e3"));
      setPaper(cs.getPropertyValue("--paper").trim() || "#e8e8e3");
      setInk(cs.getPropertyValue("--ink").trim() || "#1a1a17");
      const lines = cs.getPropertyValue("--line").trim() || cs.getPropertyValue("--ink").trim() || "#1a1a17";
      setLine(lines);
      setNave(cs.getPropertyValue("--nave").trim() || lines);
      setShade(cs.getPropertyValue("--shade").trim());
      setRays(cs.getPropertyValue("--rays").trim());
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
  const [layers, setLayers] = useState<Layers | null>(null);
  // The dust rises into the window and fades out inside it.
  useEffect(() => {
    sandNeck.y = glass.top + glass.size * (dust?.dustEnd ?? glass.dustEnd);
    sandNeck.w = outline ? 2 * outline.hw * outline.ratio * glass.size * 0.8 : 0;
    sandNeck.loose = dust?.dustLoose ?? glass.dustLoose;
    return () => {
      sandNeck.y = 0;
      sandNeck.w = 0;
      sandNeck.loose = 0;
    };
  }, [glass.top, glass.size, glass.dustEnd, glass.dustLoose, dust, outline]);
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
      style={{ "--win-top": `${glass.top * 100}vh`, "--win-h": `${glass.size * 100}vh`, "--faint": glass.cathedral, "--light": glass.light, "--walk-by": look.walk } as React.CSSProperties}
    >
      <OpeningTimeline go={go} />
      {glass.cathedral > 0 && glass.naveView !== "etched" && <Nave outline={outline} look={glass} ink={nave} strength={glass.cathedral} top={glass.top} size={glass.size} walk={glass.walk} scroll={glass.walkScroll} play={1} />}
      {glass.cathedral > 0 && glass.naveView === "etched" && <Etched outline={outline} look={glass} ink={nave} strength={glass.cathedral} top={glass.top} size={glass.size} scroll={glass.walkScroll} play={1} />}
      <div className="beam" />
      {(glass.rays > 0 || glass.rayShade > 0) && <Rays outline={outline} look={glass} ink={ink} shade={shade} light={rays} top={glass.top} size={glass.size} dark={dark} intro={go ? 1 : 0} />}
      {look.scrim > 0 && (
        <div
          className="scrim"
          style={{
            // Its height: as set, and on a phone no taller than lets its fade end at
            // the window's sill, so the cathedral's lines still show round the window.
            ["--scrim-h" as string]: `${look.scrimHeight * 100}vh`,
            ["--scrim-h-phone" as string]: `${Math.min(look.scrimHeight, Math.max(0.2, 1 - glass.top - glass.size) / Math.max(0.05, Math.max(look.scrimSolid, look.scrimEnd))) * 100}vh`,
            opacity: look.scrim,
            background: scrimPaint(look, paper),
            // The half circle's half width: as set, and on a phone wide enough that
            // its full colour reaches both edges of the screen.
            ["--scrim-rx" as string]: `${look.scrimWide * 50}vw`,
            ["--scrim-rx-phone" as string]: `max(${look.scrimWide * 50}vw, ${Math.round(55 / Math.max(0.05, Math.min(look.scrimSolid, look.scrimEnd)))}vw)`,
          }}
        />
      )}
      <WindowCanvas ink={line} paper={paper} className="win-canvas" play={1} onLook={setGlass} onLayers={(L) => {
          setLayers(L);
          setOutline(outlineOf(L));
        }}
      />
      {fxOn(glass) && <GlassFx layers={layers} look={glass} light={rays} dark={dark} />}
    </div>
  );
}

// The scrim's gradient. Linear: a band rising from the bottom edge. Radial: a
// half circle sitting on the bottom edge, like a sun going down.
function scrimPaint(look: Look, paper: string) {
  const c = look.scrimTone === "dark" ? "#000" : look.scrimTone === "custom" ? look.scrimColor : paper;
  const a = Math.min(look.scrimSolid, look.scrimEnd) * 100;
  const b = Math.max(look.scrimSolid, look.scrimEnd) * 100;
  const stops = `${c} 0%, ${c} ${a}%, color-mix(in srgb, ${c} 0%, transparent) ${b}%`;
  return look.scrimShape === "radial" ? `radial-gradient(ellipse var(--rx) 100% at 50% 100%, ${stops})` : `linear-gradient(to top, ${stops})`;
}

export default function CathedralPage({ paragraphs }: { paragraphs: string[] }) {
  const [look, setLook] = useStored<Look>("crucible-site:home-look", LOOK);
  const [replay, setReplay] = useState(0);
  // Where the sand ends inside the window. Kept with the window's settings
  // (they are measured against the window), shown with the other sand settings.
  const [dust, setDustState] = useState<Dust | null>(null);
  useEffect(() => {
    const saved = readSaved<Partial<Dust>>(GLASS_KEY) || {};
    setDustState({ dustEnd: saved.dustEnd ?? GLASS_LOOK.dustEnd, dustLoose: saved.dustLoose ?? GLASS_LOOK.dustLoose });
  }, []);
  const setDust = (part: Partial<Dust>) => {
    const next = { ...(dust || { dustEnd: GLASS_LOOK.dustEnd, dustLoose: GLASS_LOOK.dustLoose }), ...part };
    setDustState(next);
    writeSaved(GLASS_KEY, { ...GLASS_LOOK, ...(readSaved<object>(GLASS_KEY) || {}), ...next });
  };
  const dustSlider = (key: keyof Dust, label: string) => (
    <label>
      <span>
        {label} <b>{Number(dust?.[key] ?? GLASS_LOOK[key]).toFixed(2)}</b>
      </span>
      <input type="range" min={0} max={1} step={0.01} value={Number(dust?.[key] ?? GLASS_LOOK[key])} onChange={(e) => setDust({ [key]: Number(e.target.value) })} />
    </label>
  );
  const chant = useChant();
  // The enter moment: a veil with the lockup. Nothing opens, and no sound plays, until it is pressed.
  const [entered, setEntered] = useState(false);
  const [veil, setVeil] = useState(true); // kept on the page while it fades away
  const enter = () => {
    if (entered) return;
    chant.begin();
    setEntered(true);
    setTimeout(() => setVeil(false), 2200);
  };
  // On the client site the page always opens at the top, with the text at its
  // starting position, even when the browser remembers where it was scrolled to.
  useEffect(() => {
    if (isWorkingCopy()) return;
    history.scrollRestoration = "manual";
    const top = () => window.scrollTo(0, 0);
    top();
    // Some browsers put the old position back a moment after load.
    const again = [60, 300, 800].map((ms) => setTimeout(top, ms));
    window.addEventListener("load", top);
    window.addEventListener("pageshow", top);
    return () => {
      again.forEach(clearTimeout);
      window.removeEventListener("load", top);
      window.removeEventListener("pageshow", top);
    };
  }, []);
  // After swapping options the page comes back already entered.
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(SKIP_GATE)) return;
      sessionStorage.removeItem(SKIP_GATE);
    } catch {
      return;
    }
    setEntered(true);
    setVeil(false);
    // The sound carries on as well, unless the visitor turned it off. If the
    // browser holds it back after the reload, it starts at the next tap or key.
    chant.begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-gate", !entered);
    return () => document.documentElement.removeAttribute("data-gate");
  }, [entered]);
  const set = (patch: Partial<Look>) => setLook({ ...look, ...patch });

  // The text face is set on the document so the sand is cut from the same letters.
  useEffect(() => {
    const root = document.documentElement;
    if (look.font === "sans") root.style.setProperty("--text-font", SANS);
    else if (look.font === "semplicita") root.style.setProperty("--text-font", SEMPLICITA);
    else if (look.font === "asta") root.style.setProperty("--text-font", ASTA);
    else if (look.font === "cantarell") root.style.setProperty("--text-font", CANTARELL);
    else if (look.font === "times") root.style.setProperty("--text-font", TIMES);
    else root.style.removeProperty("--text-font");
    // Justified text in the sans face keeps its normal word spaces; the mono face is tightened a little.
    root.style.setProperty("--text-align", look.align === "justified" ? "justify" : look.align === "center" ? "center" : "left");
    root.style.setProperty("--text-wrap", look.wrap === "tidy" ? "pretty" : look.wrap === "even" ? "balance" : "wrap");
    root.style.setProperty("--text-last", look.align === "center" ? "center" : "left");
    root.style.setProperty("--text-hyphens", "none"); // words are never broken across lines here
    root.style.setProperty("--text-word", "nowrap");
    root.style.setProperty("--text-space", look.align === "justified" && look.font === "mono" ? "-0.18em" : "0em");
    if (look.font === "asta") root.style.setProperty("--text-weight", String(look.textWeight));
    else if (look.font === "semplicita") root.style.setProperty("--text-weight", String(look.brandWeight));
    else root.style.removeProperty("--text-weight");
    root.style.setProperty("--text-size", `${look.textSize}px`);
    root.style.setProperty("--text-line", String(look.textLine));
    root.style.setProperty("--text-gap", `${look.textGap}em`);
    root.style.setProperty("--text-track", `${look.textTrack / 100}em`);
    root.style.setProperty("--nav-size", `${look.navSize}px`);
    root.style.setProperty("--head-size", `${look.headSize}px`);
    root.style.setProperty("--label-track", `${look.labelTrack}px`);
    root.style.setProperty("--text-tilt", String(look.tilt ?? LOOK.tilt));
    // The dust measures where the words sit, so tell it they have moved.
    const moved = setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    // A served face can arrive a moment later and shift the lines.
    document.fonts?.ready.then(() => window.dispatchEvent(new Event("resize")));
    root.style.setProperty("--text-width", `${look.textWidth}px`);
    return () => {
      clearTimeout(moved);
      for (const k of ["--text-wrap", "--text-last", "--text-font", "--text-size", "--text-weight", "--text-line", "--text-gap", "--text-track", "--text-width", "--text-align", "--text-hyphens", "--text-word", "--text-space", "--text-tilt", "--o"]) root.style.removeProperty(k);
    };
  }, [look.wrap, look.font, look.textWeight, look.brandWeight, look.align, look.textSize, look.textLine, look.textGap, look.textTrack, look.navSize, look.headSize, look.labelTrack, look.tilt, look.textWidth]);

  const slider = (key: keyof Look, label: string, min: number, max: number, step: number) => (
    <label>
      <span>
        {label} <b>{Number(look[key] ?? LOOK[key]).toFixed(2)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={Number(look[key] ?? LOOK[key])} onChange={(e) => set({ [key]: Number(e.target.value) })} />
    </label>
  );
  const extra = (
    <>
      <Fold id="home-type" title="type" open>
        <p className="head">text</p>
          <div className="actions">
            {([["semplicita", "semplicita"], ["asta", "asta sans"], ["cantarell", "cantarell"], ["times", "times new roman"], ["sans", "sans"], ["mono", "mono"]] as const).map(([v, name]) => (
              <button key={v} className={look.font === v ? "on" : ""} onClick={() => set({ font: v })}>
                {name}
              </button>
            ))}
          </div>
        {look.font === "asta" && slider("textWeight", "weight", 300, 800, 10)}
        {look.font === "semplicita" && (
          <div className="actions">
            {([[300, "light"], [400, "regular"], [500, "medium"], [700, "bold"]] as const).map(([v, name]) => (
              <button key={v} className={look.brandWeight === v ? "on" : ""} onClick={() => set({ brandWeight: v })}>
                {name}
              </button>
            ))}
          </div>
        )}
        {slider("textSize", "size (px)", 10, 28, 0.5)}
        {slider("textLine", "line height", 1, 2.4, 0.01)}
        {slider("textTrack", "letter spacing", -5, 20, 0.1)}
        {slider("textGap", "space between paragraphs", 0, 5, 0.05)}
        {slider("textWidth", "column width (px)", 280, 900, 10)}
        {slider("tilt", "perspective: larger at the bottom (%)", 0, 30, 0.5)}
          <div className="actions">
            {([["left", "left"], ["center", "centred"], ["justified", "justified"]] as const).map(([v, name]) => (
              <button key={v} className={look.align === v ? "on" : ""} onClick={() => set({ align: v })}>
                {name}
              </button>
            ))}
          </div>
          <div className="actions">
            {([["normal", "plain breaks"], ["tidy", "tidy breaks"], ["even", "even lines"]] as const).map(([v, name]) => (
              <button key={v} className={look.wrap === v ? "on" : ""} onClick={() => set({ wrap: v })}>
                {name}
              </button>
            ))}
          </div>
        <p className="head">nav and section headers</p>
        {slider("navSize", "nav links size (px)", 9, 18, 0.5)}
        {slider("headSize", "section header size (px)", 9, 18, 0.5)}
        {slider("labelTrack", "letter spacing (px)", -1, 4, 0.1)}
      </Fold>
      <Fold id="home-scrim" title="scrim behind the text">
        {slider("scrim", "strength (0 = off)", 0, 1, 0.01)}
        {slider("scrimHeight", "height", 0.1, 1, 0.01)}
          <div className="actions">
            {([["page", "page colour"], ["dark", "black"], ["custom", "own colour"]] as const).map(([v, name]) => (
              <button key={v} className={look.scrimTone === v ? "on" : ""} onClick={() => set({ scrimTone: v })}>
                {name}
              </button>
            ))}
          </div>
        {look.scrimTone === "custom" && (
          <label className="swatch">
            <span>
              scrim colour <b>{look.scrimColor}</b>
            </span>
            <input type="color" value={look.scrimColor} onChange={(e) => set({ scrimColor: e.target.value })} />
          </label>
        )}
          <div className="actions">
            {([["linear", "linear"], ["radial", "radial (half circle)"]] as const).map(([v, name]) => (
              <button key={v} className={look.scrimShape === v ? "on" : ""} onClick={() => set({ scrimShape: v })}>
                {name}
              </button>
            ))}
          </div>
        {slider("scrimSolid", "full colour until", 0, 1, 0.01)}
        {slider("scrimEnd", "faded out by", 0, 1, 0.01)}
        {look.scrimShape === "radial" && slider("scrimWide", "half circle width", 0.3, 3, 0.01)}
      </Fold>
      <Fold id="home-opening" title="opening">
        <p className="note">The timings are set. To change them, add ?timeline to the address and a timeline appears along the bottom. The window, the cathedral and the light are set in the window tool.</p>
        <div className="actions">
          <button onClick={() => setReplay((n) => n + 1)}>replay load</button>
          <button
            onClick={() => {
              window.scrollTo(0, 0);
              setVeil(true);
              setEntered(false);
              setReplay((n) => n + 1);
            }}
          >
            replay from enter
          </button>
        </div>
      </Fold>
    </>
  );

  return (
    <>
      <SiteNav />
      {veil && (
        <button className={`gate${entered ? " leaving" : ""}`} onClick={enter} onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()} aria-label="Enter Crucible" autoFocus>
          <span className="gate-mark" role="img" aria-label="Crucible" />
          <span className="gate-enter">Enter</span>
        </button>
      )}
      <button className="sound" onClick={chant.toggle} aria-pressed={chant.on} aria-label={chant.on ? "Turn sound off" : "Turn sound on"}>
        {chant.on ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}
      </button>
      <SandText
        paragraphs={paragraphs}
        variant={{
          name: "home",
          href: "/",
          backdrop: entered ? <Backdrop key={replay} look={look} replay={replay} dust={dust} /> : null,
          extra,
          sand: (
            <>
              {dustSlider("dustEnd", "sand fades out at (0 = top of the window, 1 = its sill)")}
              {dustSlider("dustLoose", "sand in the window: funnel (0) to drift (1)")}
            </>
          ),
          scroll: slider("walk", "walk in on scroll", 0, 1, 0.05),
          reset: <button onClick={() => setLook(LOOK)}>reset type, scrim and walk</button>,
        }}
      />
    </>
  );
}
