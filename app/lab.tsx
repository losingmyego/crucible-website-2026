"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

// Shared pieces for the experiment pages: the version switcher, remembered
// settings, smooth scrolling and a small settings panel.

export const VERSIONS = [
  { href: "/", label: "home" },
  { href: "/topography", label: "topography" },
  { href: "/topography-2", label: "topography 2" },
  { href: "/tool", label: "window tool" },
];

// Neesh's three colour schemes (2026-11-10). `dots` is the third colour:
// the contour dots on the map pages, and what the sand fades to on a light page.
export const THEMES = {
  light: { paper: "#e8e8e3", ink: "#1a1a17", dots: "#90908e" },
  medium: { paper: "#6e6a66", ink: "#d8d8ca", dots: "#b2b2ae" },
  dark: { paper: "#1a1a17", ink: "#d8d8ca", dots: "#76766f" },
  // A fourth theme to work a colour out in: a dark chocolate brown to start from.
  // A working pick, not in the brand kit.
  custom: { paper: "#2a1c15", ink: "#e6dccf", dots: "#8c7566" },
} as const;
export type ThemeName = keyof typeof THEMES;

export const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 128;
};

// Where each page keeps its settings in the browser.
const PREFIX = "crucible-site:";
// The lightest kit neutral: what the sand fades to on the medium and dark pages.
export const SAND_FAR = "#f6f6f4";

// Saved settings live in three places, so they hold in any browser:
// in memory (carries between views), in the browser's storage (carries
// between visits), and, where a browser refuses storage, in the web address.
const MEM: Record<string, unknown> = {};
let booted = false;
let storageOk = false;
let hashTimer: ReturnType<typeof setTimeout> | null = null;

const pack = () => {
  const all: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(MEM)) all[key.slice(PREFIX.length)] = value;
  return btoa(encodeURIComponent(JSON.stringify(all))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function boot() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  try {
    localStorage.setItem("crucible-site-test", "1");
    storageOk = localStorage.getItem("crucible-site-test") === "1";
    localStorage.removeItem("crucible-site-test");
  } catch {}
  if (storageOk) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      try {
        MEM[key] = JSON.parse(localStorage.getItem(key) || "");
      } catch {}
    }
  }
  // Settings carried in the address (a share link) win over what was stored.
  const m = window.location.hash.match(/^#set=([\w-]+)$/);
  if (!m) return;
  try {
    const all = JSON.parse(decodeURIComponent(atob(m[1].replace(/-/g, "+").replace(/_/g, "/"))));
    for (const [name, value] of Object.entries(all)) {
      if (!value || typeof value !== "object") continue;
      MEM[PREFIX + name] = value;
      try {
        localStorage.setItem(PREFIX + name, JSON.stringify(value));
      } catch {}
    }
  } catch {}
  if (storageOk) history.replaceState(history.state, "", location.pathname + location.search);
}

export function readSaved<T = Record<string, unknown>>(key: string): T | undefined {
  boot();
  return MEM[key] as T | undefined;
}

export function writeSaved(key: string, value: unknown) {
  boot();
  MEM[key] = value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  if (storageOk || typeof window === "undefined") return;
  // No storage in this browser: keep the settings in the address instead.
  if (hashTimer) clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    history.replaceState(history.state, "", `${location.pathname}${location.search}#set=${pack()}`);
  }, 250);
}

// Themes. The chosen theme is shared by every view. Each family of views
// (the sand views, the map views) keeps its own full set of colours for each
// theme, so a colour changed under one theme is still there after switching
// themes or views.
export const THEME_KEY = "crucible-site:theme";
type Slots<C> = Partial<Record<ThemeName, Partial<C>>>;

export function useThemeColors<C extends Record<string, string>>(
  family: "home" | "topo",
  base: Record<ThemeName, C>,
  fallback: ThemeName,
) {
  const key = `${PREFIX}colors-${family}`;
  const [theme, setTheme] = useState<ThemeName>(fallback);
  const [colors, setColorsState] = useState<C>(base[fallback]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const slots = readSaved<Slots<C>>(key) || {};
    let name = readSaved<{ name?: ThemeName }>(THEME_KEY)?.name;
    if (!name || !base[name]) name = fallback;
    setTheme(name);
    setColorsState({ ...base[name], ...slots[name] });
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setColors = (next: C) => {
    setColorsState(next);
    writeSaved(key, { ...(readSaved<Slots<C>>(key) || {}), [theme]: next });
  };
  const pick = (name: ThemeName) => {
    writeSaved(THEME_KEY, { name });
    setTheme(name);
    setColorsState({ ...base[name], ...(readSaved<Slots<C>>(key) || {})[name] });
  };
  const reset = () => setColors(base[theme]);
  return { theme, colors, setColors, pick, reset, loaded };
}

// A link that carries the saved settings of every page. Opening it in any
// browser puts those settings in place there.
export function shareLink() {
  boot();
  return `${location.origin}${location.pathname}#set=${pack()}`;
}

export function ShareButton() {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        const link = shareLink();
        try {
          await navigator.clipboard.writeText(link);
        } catch {
          window.prompt("Copy this link", link);
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? "link copied" : "copy share link"}
    </button>
  );
}

export const SAVED_NOTE =
  "Everything is remembered in this browser. The theme carries across every view, and each theme keeps its own colours. To show someone else your settings, send them the share link.";

export function ThemeButtons({ current, onPick }: { current?: ThemeName; onPick: (name: ThemeName) => void }) {
  return (
    <div className="actions">
      {(Object.keys(THEMES) as ThemeName[]).map((name) => (
        <button key={name} className={name === current ? "on" : ""} onClick={() => onPick(name)}>
          {name === "custom" ? "custom theme" : name}
        </button>
      ))}
    </div>
  );
}

export function Versions({ current }: { current: string }) {
  return (
    <nav className="versions">
      {VERSIONS.map((v) => (
        <Link key={v.href} href={v.href} className={v.href === current ? "on" : ""}>
          {v.label}
        </Link>
      ))}
    </nav>
  );
}

// Settings that are remembered under `key`.
export function useStored<T extends object>(key: string, defaults: T) {
  const [value, setValue] = useState<T>(defaults);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const saved = readSaved<Partial<T>>(key);
    if (saved) setValue({ ...defaults, ...saved });
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (loaded) writeSaved(key, value);
  }, [loaded, key, value]);
  return [value, setValue, loaded] as const;
}

// Lenis smooths the scroll and adds drag. Lower lerp = heavier feel.
export function useSmoothScroll(weight: number, speed: number) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.22 * Math.pow(1 - weight, 1.6) + 0.012,
      wheelMultiplier: speed,
      touchMultiplier: speed,
    });
    return () => lenis.destroy();
  }, [weight, speed]);
}

// Page colours go to the document so the whole window takes them.
export function usePageColors(paper: string, ink: string) {
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--paper", paper);
    root.setProperty("--ink", ink);
  }, [paper, ink]);
}

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export type Control<T> =
  | { key: keyof T & string; label: string; min: number; max: number; step: number }
  | { key: keyof T & string; label: string; color: true };

export function Panel<T extends Record<string, number | string>>({
  current,
  controls,
  value,
  onChange,
  defaults,
  onReplay,
  extra,
}: {
  current: string;
  controls: Control<T>[];
  value: T;
  onChange: (next: T) => void;
  defaults: T;
  onReplay?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="panel" data-lenis-prevent>
      <Versions current={current} />
      {controls.map((c) =>
        "color" in c ? (
          <label className="swatch" key={c.key}>
            <span>
              {c.label} <b>{String(value[c.key])}</b>
            </span>
            <input
              type="color"
              value={String(value[c.key])}
              onChange={(e) => onChange({ ...value, [c.key]: e.target.value })}
            />
          </label>
        ) : (
          <label key={c.key}>
            <span>
              {c.label} <b>{Number(value[c.key]).toFixed(2)}</b>
            </span>
            <input
              type="range"
              min={c.min}
              max={c.max}
              step={c.step}
              value={Number(value[c.key])}
              onChange={(e) => onChange({ ...value, [c.key]: Number(e.target.value) })}
            />
          </label>
        ),
      )}
      {extra}
      <div className="actions">
        {onReplay && <button onClick={onReplay}>replay load</button>}
        <button onClick={() => onChange(defaults)}>reset</button>
        <ShareButton />
      </div>
      <p className="note">{SAVED_NOTE}</p>
    </div>
  );
}

// A small button that shows or hides the settings panel. The panel is for
// working on the page and starts hidden; the choice is remembered.
export function PanelToggle() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const saved = readSaved<{ open?: boolean }>(PREFIX + "panel");
    if (saved?.open) setOpen(true);
  }, []);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-panel", open);
  }, [open]);
  return (
    <button
      className="panel-toggle"
      aria-pressed={open}
      onClick={() => {
        writeSaved(PREFIX + "panel", { open: !open });
        setOpen(!open);
      }}
    >
      {open ? "hide settings" : "settings"}
    </button>
  );
}
