"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShareButton, THEMES, Versions, useStored, usePageColors } from "../lab";
import { draw, loadWindow, paint, Layers } from "./engine";
import { rgb, useWindow } from "./useWindow";
import Rays from "./Rays";
import Nave from "./Nave";
import Etched from "./Etched";
import { outlineOf } from "./nave";
import { FRAMES, GLASS_KEY, GLASS_LOOK as LOOK, Look, NAVES, place, UPLOAD_KEY } from "./look";

/**
 * The window tool (2026-11-16).
 *
 * Neesh draws a window as an SVG: stone tracery with the symbol built in, and
 * optional leading. This page loads it, sits it in the faint cathedral, and
 * gives live controls for how it is drawn. Nothing here is a brand decision
 * yet; it is a place to find the look.
 */

const WORK = 1000; // height the window is drawn at while you adjust it

export default function GlassTool() {
  const [look, setLook, loaded] = useStored<Look>(GLASS_KEY, LOOK);
  const [layers, setLayers] = useState<Layers | null>(null);
  const [note, setNote] = useState("");
  const [upload, setUpload] = useState<{ name: string; text: string } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const svgText = useRef("");
  const set = (patch: Partial<Look>) => setLook({ ...look, ...patch });
  const theme = THEMES[look.theme] || THEMES.light;
  usePageColors(theme.paper, theme.ink);

  // A window dropped in earlier is remembered in this browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(UPLOAD_KEY);
      if (saved) setUpload(JSON.parse(saved));
    } catch {}
  }, []);

  // Load the chosen window and split it into layers.
  useEffect(() => {
    if (!loaded) return;
    let off = false;
    (async () => {
      try {
        const text = look.frame === "upload" ? upload?.text : await (await fetch(look.frame)).text();
        if (!text) {
          if (look.frame === "upload") set({ frame: FRAMES[0].file });
          return;
        }
        svgText.current = text;
        const L = await loadWindow(text, WORK);
        if (off) return;
        setLayers(L);
        setNote(`${L.counts.stone} stone, ${L.counts.symbol} symbol, ${L.counts.lead} leading shapes`);
      } catch (e) {
        if (!off) setNote(e instanceof Error ? e.message : "Could not load that window.");
      }
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, look.frame, upload]);

  const [play, setPlay] = useState(0);
  const outline = useMemo(() => (layers ? outlineOf(layers) : null), [layers]);
  useWindow(canvas, layers, look, theme.ink, theme.paper, play);

  const onFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    const next = { name: file.name, text };
    try {
      localStorage.setItem(UPLOAD_KEY, JSON.stringify(next));
    } catch {}
    setUpload(next);
    set({ frame: "upload" });
  };

  // Save the window alone, with no background, at twice the working size.
  const save = async () => {
    if (!svgText.current) return;
    setNote("Drawing the large version…");
    const big = await loadWindow(svgText.current, WORK * 2);
    const c = document.createElement("canvas");
    c.width = big.w;
    c.height = big.h;
    const g = c.getContext("2d")!;
    const img = g.createImageData(big.w, big.h);
    paint(draw(big, look), rgb(theme.ink), null, 1, img);
    g.putImageData(img, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "crucible-window.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setNote("Saved crucible-window.png");
    });
  };

  const slider = (key: keyof Look, label: string, min: number, max: number, step: number) => (
    <label>
      <span>
        {label} <b>{Number(look[key]).toFixed(step < 1 ? 2 : 0)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={Number(look[key])} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<Look>)} />
    </label>
  );
  const choice = (key: keyof Look, options: [string | number, string][]) => (
    <div className="actions pick">
      {options.map(([value, label]) => (
        <button key={String(value)} className={look[key] === value ? "on" : ""} onClick={() => set({ [key]: value } as Partial<Look>)}>
          {label}
        </button>
      ))}
    </div>
  );
  // Sections fold open and closed; some can be switched off as a whole.
  const [ui, setUi] = useStored<{ open: Record<string, boolean>; was: Record<string, number> }>("crucible-site:window-panel", { open: { drawing: true, rays: true, nave: true, space: true }, was: {} });
  const section = (id: string, title: string, body: React.ReactNode, sw?: keyof Look) => {
    const open = !!ui.open[id];
    const on = sw ? Number(look[sw]) > 0 : true;
    return (
      <section className={`fold${open ? " open" : ""}${on ? "" : " off"}`}>
        <div className="fold-head">
          <button className="fold-title" aria-expanded={open} onClick={() => setUi({ ...ui, open: { ...ui.open, [id]: !open } })}>
            <i>{open ? "−" : "+"}</i> {title}
          </button>
          {sw && (
            <button
              className={`switch${on ? " on" : ""}`}
              role="switch"
              aria-checked={on}
              aria-label={`${title} ${on ? "on" : "off"}`}
              onClick={() => {
                if (on) {
                  setUi({ ...ui, was: { ...ui.was, [sw]: Number(look[sw]) } });
                  set({ [sw]: 0 } as Partial<Look>);
                } else set({ [sw]: ui.was[sw] || Number(LOOK[sw]) || (sw === "echo" ? 4 : 0.6) } as Partial<Look>);
              }}
            >
              {on ? "on" : "off"}
            </button>
          )}
        </div>
        {open && <div className="fold-body">{body}</div>}
      </section>
    );
  };
  const all = (open: boolean) => setUi({ ...ui, open: Object.fromEntries(["drawing", "stone", "symbol", "leading", "echo", "line", "light", "rays", "page", "nave", "space", "detail", "machine", "hand"].map((k) => [k, open])) });
  const dark = look.theme !== "light";

  return (
    <>
      <div
        key={play}
        className={`cathedral glass-stage${play ? " opening go" : ""}${dark ? " dark" : ""}`}
        style={{ "--win-top": `${look.top * 100}vh`, "--win-h": `${look.size * 100}vh`, "--faint": look.cathedral, "--light": look.light } as React.CSSProperties}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files[0]);
        }}
      >
        {look.cathedral > 0 && look.naveView !== "etched" && <Nave outline={outline} look={look} ink={theme.ink} strength={look.cathedral} top={look.top} size={look.size} walk={look.walk} play={play} />}
        {look.cathedral > 0 && look.naveView === "etched" && <Etched outline={outline} look={look} ink={theme.ink} strength={look.cathedral} top={look.top} size={look.size} play={play} />}
        <div className="beam" />
        {(look.rays > 0 || look.rayShade > 0) && <Rays outline={outline} look={look} ink={theme.ink} top={look.top} size={look.size} dark={dark} />}
        <canvas ref={canvas} className="win-canvas" style={place(layers)} />
      </div>
      <div className="panel">
        <Versions current="/tool" />
        <div className="group">
          <div className="actions fold-all">
            <button onClick={() => all(true)}>open all</button>
            <button onClick={() => all(false)}>close all</button>
          </div>

          <p className="head">the window</p>
          {section(
            "drawing",
            "drawing",
            <>
              <div className="actions pick">
                {FRAMES.map((f) => (
                  <button key={f.file} className={look.frame === f.file ? "on" : ""} onClick={() => set({ frame: f.file })}>
                    {f.label}
                  </button>
                ))}
                {upload && (
                  <button className={look.frame === "upload" ? "on" : ""} onClick={() => set({ frame: "upload" })} title={upload.name}>
                    yours
                  </button>
                )}
                <label className="file">
                  load svg
                  <input type="file" accept=".svg,image/svg+xml" onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
              </div>
              <p className="note">{note}</p>
            </>,
          )}
          {section(
            "stone",
            "stone",
            <>
              {choice("stone", [["solid", "solid"], ["outline", "outline"]])}
              {slider("weight", "thickness", -11, 6, 0.25)}
              {look.stone === "outline" && slider("line", "outline line", 0.6, 6, 0.1)}
              {look.stone === "outline" && slider("mould", "moulding line (0 = off)", 0, 12, 0.25)}
              {slider("winTone", "stone strength", 0, 1, 0.01)}
            </>,
            "winTone",
          )}
          {section(
            "symbol",
            "symbol",
            <>
              {look.stone === "outline" && choice("symbolSolid", [[1, "solid"], [0, "outline"]])}
              {slider("symTone", "symbol strength", 0, 1, 0.01)}
            </>,
            "symTone",
          )}
          {section(
            "leading",
            "leading",
            <>
              {choice("pattern", [["diamond", "diamond"], ["grid", "grid"], ["rays", "rays"], ["none", "none"]])}
              {layers?.lead && choice("own", [[1, "with drawn leading"], [0, "without"]])}
              {slider("leadW", "thickness", 0.5, 8, 0.1)}
              {look.pattern !== "none" && slider("spacing", "spacing", 14, 140, 1)}
              {look.pattern === "diamond" && slider("angle", "diamond steepness", 10, 60, 1)}
              {look.pattern !== "none" && slider("leadFrom", "pattern starts at", 0, 0.8, 0.01)}
              {slider("leadTone", "leading strength", 0, 1, 0.01)}
            </>,
            "leadTone",
          )}
          {section(
            "echo",
            "arches behind it",
            <>
              {slider("echo", "how many", 0, 10, 1)}
              {slider("echoGap", "first gap", 6, 80, 1)}
              {slider("echoGrow", "gaps widen by", 0, 40, 0.5)}
              {slider("echoTone", "strength", 0, 1, 0.01)}
              {look.stone !== "outline" && slider("line", "line thickness", 0.6, 6, 0.1)}
            </>,
            "echo",
          )}
          {section(
            "line",
            "hand-drawn line",
            <>
              {slider("soft", "soften", 0.3, 8, 0.1)}
              {slider("grain", "grain", 0, 1.5, 0.01)}
              {slider("grainSize", "grain size", 0.8, 5, 0.1)}
              {slider("breaks", "uneven, broken", 0, 1.5, 0.01)}
              {slider("level", "threshold level", 0.15, 0.85, 0.01)}
              {slider("wobble", "wobble", 0, 5, 0.05)}
              {slider("wobbleLen", "wobble length", 8, 160, 1)}
              <div className="actions">
                <button onClick={() => set({ seed: look.seed + 1 })}>redraw by hand</button>
                <button onClick={() => set({ soft: 0.35, grain: 0, breaks: 0, wobble: 0, level: 0.5 })}>clean</button>
              </div>
            </>,
          )}
          {section(
            "light",
            "glass and light",
            <>
              {choice("glassColor", [["light", "white"], ["orange", "burnt orange"], ["ink", "ink"]])}
              {slider("glass", "light in the glass", 0, 1, 0.01)}
              {slider("light", "light falling from it", 0, 1, 0.02)}
              {slider("clear", "hide cathedral behind window", 0, 1, 0.02)}
            </>,
            "glass",
          )}
          {section(
            "rays",
            "light rays",
            <>
              {slider("rays", "strength", 0, 1.5, 0.01)}
              {slider("rayShade", "shade the room (so light shows)", 0, 1, 0.01)}
              {slider("rayCount", "how many", 2, 60, 1)}
              {slider("raySpread", "fan out", 0, 1, 0.01)}
              {slider("rayLength", "length", 0.2, 2, 0.01)}
              {slider("rayMove", "movement", 0, 4, 0.05)}
              {choice("rayColor", [["white", "white"], ["warm", "warm"]])}
              {slider("dustEnd", "dust fades out at (cathedral page)", 0, 1, 0.01)}
              {slider("dustLoose", "dust: funnel (0) to drift (1)", 0, 1, 0.01)}
            </>,
            "rays",
          )}
          {section(
            "page",
            "size, place, colour",
            <>
              {choice("theme", [["light", "light"], ["medium", "medium"], ["dark", "dark"], ["custom", "custom"]])}
              {slider("size", "window size", 0.3, 0.95, 0.01)}
              {slider("top", "window top", 0, 0.4, 0.01)}
            </>,
          )}

          <p className="head">the cathedral</p>
          {section(
            "nave",
            "which cathedral",
            <>
              {choice("naveView", [["drawn", "1 drawn"], ["etched", "2 etched"]])}
              {look.naveView !== "etched" && (
                <div className="actions pick">
                  {[["first", "first version"], ["machine", "machine"], ["calm", "calm"]].map(([name, label]) => (
                    <button key={name} className={Object.entries(NAVES[name]).every(([k, v]) => look[k as keyof Look] === v) ? "on" : ""} onClick={() => set(NAVES[name])}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {slider("cathedral", "strength", 0, 0.8, 0.01)}
            </>,
            "cathedral",
          )}
          {look.naveView === "etched" &&
            section(
              "etch",
              "the engraving",
              <>
                {slider("etchSize", "picture size", 0.8, 3, 0.01)}
                {slider("etchClear", "clear room round the window", 0.5, 2.5, 0.01)}
                {choice("etchInk", [["dark", "ink the shadows"], ["light", "ink the lights"]])}
                {slider("etchLines", "engraving spacing", 0.8, 12, 0.1)}
                {slider("etchWeight", "line weight", 0.4, 1.6, 0.01)}
                {slider("etchAngle", "engraving angle", -90, 90, 1)}
                {slider("etchBend", "contour flow", 0, 1.6, 0.01)}
                {slider("etchCross", "shadow crosshatching", 0, 1, 0.01)}
                {slider("etchDetail", "architectural detail", 0, 2, 0.05)}
                {slider("etchExposure", "exposure", -2, 2, 0.05)}
                {slider("etchContrast", "contrast", 0.5, 2, 0.05)}
                {slider("etchStipple", "fine stippling", 0, 1, 0.01)}
                {slider("etchWear", "ink wear", 0, 1, 0.01)}
                {slider("walkScroll", "come closer on scroll (cathedral page)", 0, 2, 0.05)}
              </>,
            )}
          {section(
              "space",
              "space and spacing",
              <>
                {slider("naveWide", "room beside the window", 1, 2.2, 0.01)}
                {slider("naveLift", "room above the window (raise arches)", 0, 3, 0.01)}
                {slider("naveClear", "fade lines near the window", 0.03, 2.5, 0.01)}
                {slider("naveBay", "arch spacing near the window", 1.04, 2, 0.01)}
                {slider("naveBayFar", "arch spacing at the front", 1.04, 2.4, 0.01)}
                {slider("naveDrop", "floor below the sill", 0, 0.8, 0.01)}
                {slider("naveEye", "eye level", 0, 0.9, 0.01)}
                {slider("walk", "walk toward the window", 0, 6, 0.01)}
                {slider("walkScroll", "walk on scroll (cathedral page)", 0, 2, 0.05)}
              </>,
            )}
          {section(
              "detail",
              "what is drawn in it",
              <>
                {slider("naveMould", "arches: spread of their lines", 0, 0.08, 0.001)}
                {slider("naveRibs", "vault ribs", 0, 7, 1)}
                {choice("naveSides", [[1, "side windows"], [0, "plain walls"]])}
                {slider("naveBold", "heavy lines", 0, 1, 0.01)}
              </>,
            )}
          {section(
              "machine",
              "machine parts",
              <>
                {slider("naveDetail", "how much, overall", 0, 1, 0.01)}
                <p className="note">Each part, from none to twice as much:</p>
                {slider("mRings", "extra lines in the arches", 0, 2, 0.05)}
                {slider("mLadders", "ladder ticks on the arches", 0, 2, 0.05)}
                {slider("mSlots", "slots in the vault", 0, 2, 0.05)}
                {slider("mPipes", "pipes along the walls", 0, 2, 0.05)}
                {slider("mPanels", "panels with studs", 0, 2, 0.05)}
                {slider("mTraces", "jogged traces", 0, 2, 0.05)}
                {slider("mPlates", "floor plates", 0, 2, 0.05)}
                <p className="note">How they are drawn:</p>
                {slider("mTone", "strength against the arches", 0.1, 2.5, 0.05)}
                {slider("mWeight", "line weight", 0.4, 3, 0.05)}
                {slider("mCorner", "corners: square to round", 0, 1, 0.01)}
                {slider("mSize", "size of slots and panels", 0.4, 2, 0.05)}
                <div className="actions">
                  <button onClick={() => set({ mSeed: look.mSeed + 1 })}>reshuffle parts</button>
                  <button onClick={() => set({ mRings: 0, mLadders: 0, mSlots: 0, mPipes: 0, mPanels: 0, mTraces: 0, mPlates: 0 })}>all off</button>
                  <button onClick={() => set({ mRings: 1, mLadders: 1, mSlots: 1, mPipes: 1, mPanels: 1, mTraces: 1, mPlates: 1 })}>all on</button>
                </div>
              </>,
              "naveDetail",
            )}
          {section(
              "hand",
              "its line",
              <>
                {slider("naveGlow", "brighter near the window", 0, 1.5, 0.02)}
                {slider("naveWobble", "line wobble", 0, 4, 0.05)}
                {slider("naveBreaks", "line breaks", 0, 1, 0.01)}
              </>,
            )}
          <div className="actions">
            <button onClick={() => setPlay((n) => n + 1)}>play draw-in</button>
            <button onClick={save}>save png</button>
            <button onClick={() => setLook({ ...LOOK, frame: look.frame })}>reset</button>
            <ShareButton />
          </div>
        </div>
      </div>
    </>
  );
}
