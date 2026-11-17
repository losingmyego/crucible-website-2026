import { RayLook } from "./Rays";
import type { ThemeName } from "../lab";
import type { Settings } from "./engine";
import type { NaveLook } from "./nave";
import { ETCH_LOOK, EtchLook } from "./Etched";
import { WIN_ETCH_LOOK, WinEtchLook } from "./WindowEtch";

// The window tool's settings and what it opens on.
export const GLASS_KEY = "crucible-site:window";
export const UPLOAD_KEY = "crucible-site:window-upload";

export type Look = Settings & NaveLook & RayLook & EtchLook & WinEtchLook & {
  walk: number; // bays walked toward the window
  walkScroll: number; // bays walked for each screen scrolled
  frame: string; // which window drawing
  theme: ThemeName;
  cathedral: number; // strength of the cathedral lines
  size: number; // height of the window, as a share of the screen
  top: number;
  light: number; // light falling from the window
  dustLoose: number; // 0 a tight funnel, 1 a loose drift across the window
  dustEnd: number; // where the stream of dust fades out, as a share of the window's height from its top
};

export const FRAMES = [{ file: "/windows/crucible-window-1.svg", label: "window 1" }];

// Neesh's window, cathedral and light settings as of 2026-11-16.
export const GLASS_LOOK: Look = {
  frame: "/windows/crucible-window-1.svg",
  theme: "medium",
  stone: "outline",
  weight: 2.25,
  line: 0.6,
  mould: 1.75,
  symbolSolid: 0,
  soft: 1.3,
  grain: 0.3,
  grainSize: 1.7,
  breaks: 0.3,
  wobble: 0.45,
  wobbleLen: 44,
  level: 0.22,
  seed: 8,
  pattern: "diamond",
  own: 0,
  leadW: 1.1,
  spacing: 30,
  angle: 24,
  leadFrom: 0,
  winTone: 0.65,
  symTone: 1,
  leadTone: 0.33,
  echo: 2,
  echoGap: 20,
  echoGrow: 10,
  echoTone: 0.55,
  clear: 0,
  glass: 0.04,
  glassColor: "light",
  walk: 0,
  walkScroll: 1.5,
  naveBay: 1.19,
  naveBayFar: 1.4,
  naveWide: 1.2,
  naveLift: 0.21,
  naveClear: 0.45,
  naveDetail: 0.56,
  naveBold: 0,
  mRings: 0.4,
  mLadders: 1.8,
  mSlots: 1.25,
  mPipes: 0,
  mPanels: 1.3,
  mTraces: 2,
  mPlates: 0.8,
  mTone: 1,
  mWeight: 1.25,
  mCorner: 0,
  mSize: 1.25,
  mSeed: 0,
  naveMould: 0.021,
  naveRibs: 3,
  naveSides: 0,
  naveDrop: 0.09,
  naveEye: 0.38,
  naveWobble: 0,
  naveBreaks: 0.51,
  naveGlow: 0.4,
  cathedral: 0.3,
  size: 0.4,
  top: 0.08,
  light: 0.28,
  dustEnd: 0.2,
  dustLoose: 0.7,
  rays: 0.41,
  rayCount: 9,
  raySpread: 0.72,
  rayLength: 0.8,
  rayShade: 1,
  rayMove: 1.8,
  rayColor: "white",
  ...ETCH_LOOK,
  ...WIN_ETCH_LOOK,
};

// Where a window canvas sits: the drawing has empty room round the window, so
// the canvas is larger than the window and starts above it.
export const place = (L: { w: number; h: number; pad: number } | null): React.CSSProperties =>
  L
    ? { aspectRatio: L.w / L.h, height: `calc(var(--win-h) * ${(L.h / (L.h - L.pad * 2)).toFixed(4)})`, top: `calc(var(--win-top) - var(--win-h) * ${(L.pad / (L.h - L.pad * 2)).toFixed(4)})` }
    : { aspectRatio: 0.55 };

// Three versions of the drawn cathedral. Each is only a set of slider values.
export const NAVES: Record<string, Partial<Look>> = {
  first: { naveBay: 1.17, naveBayFar: 1.17, naveWide: 1, naveClear: 0.1, naveMould: 0.016, naveRibs: 4, naveSides: 1, naveDrop: 0.22, naveEye: 0.42, naveWobble: 0.8, naveBreaks: 0.25, naveGlow: 0.6, naveDetail: 0, naveBold: 0 },
  machine: { naveBay: 1.3, naveBayFar: 1.42, naveWide: 1.28, naveClear: 0.45, naveMould: 0.011, naveRibs: 3, naveSides: 0, naveDrop: 0.3, naveEye: 0.42, naveWobble: 0.9, naveBreaks: 0.3, naveGlow: 0.3, naveDetail: 0.85, naveBold: 0.7 },
  calm: { naveBay: 1.5, naveBayFar: 1.75, naveWide: 1.4, naveClear: 0.9, naveMould: 0.012, naveRibs: 0, naveSides: 0, naveDrop: 0.3, naveEye: 0.42, naveWobble: 0.6, naveBreaks: 0.2, naveGlow: 0, naveDetail: 0, naveBold: 0 },
};
