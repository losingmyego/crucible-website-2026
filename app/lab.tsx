"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OPTIONS } from "./options";
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

const unpack = (packed: string): Record<string, unknown> => {
  try {
    return JSON.parse(decodeURIComponent(atob(packed.replace(/-/g, "+").replace(/_/g, "/"))));
  } catch {
    return {};
  }
};
// Things that belong to the visitor, not to a look: they stay when the look is swapped.
const KEPT = ["panel", "sound", "option", "window-panel"];
const kept = (name: string) => KEPT.includes(name) || name.startsWith("fold:");
// A short mark of the options as they are built in now. When they change, the
// live site puts the new ones in place of whatever a visitor's browser had kept.
const STAMP = (() => {
  let h = 0;
  for (const ch of OPTIONS.join("|")) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return String(h);
})();
// A working copy is this computer or a branch preview; anything else is the live site.
export const isWorkingCopy = () => {
  const host = location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host.includes("-git-") || new URLSearchParams(location.search).has("settings");
};
// Put one of the options in place of the current settings.
function install(n: number) {
  for (const key of Object.keys(MEM)) {
    if (kept(key.slice(PREFIX.length))) continue;
    delete MEM[key];
    try {
      localStorage.removeItem(key);
    } catch {}
  }
  const all = { ...unpack(OPTIONS[n]), option: { n, v: STAMP } };
  for (const [name, value] of Object.entries(all)) {
    if (!value || typeof value !== "object" || (kept(name) && name !== "option")) continue;
    MEM[PREFIX + name] = value;
    try {
      localStorage.setItem(PREFIX + name, JSON.stringify(value));
    } catch {}
  }
}

// Sent in this tab when another tab has changed a saved setting; detail is its key.
export const SYNC = "crucible-site:sync";
export function onSync(keys: string[], then: () => void) {
  const hear = (e: Event) => {
    if (keys.includes((e as CustomEvent<string>).detail)) then();
  };
  window.addEventListener(SYNC, hear);
  return () => window.removeEventListener(SYNC, hear);
}

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
  // Settings changed in another tab of this browser arrive here too, so the
  // homepage and the window tool can sit side by side and stay in step.
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(PREFIX)) return;
    try {
      if (e.newValue === null) delete MEM[e.key];
      else MEM[e.key] = JSON.parse(e.newValue);
    } catch {
      return;
    }
    window.dispatchEvent(new CustomEvent(SYNC, { detail: e.key }));
  });
  // A visitor with nothing saved starts on Option 1. On the live site the built-in
  // options always win: settings a browser kept from an earlier version are replaced.
  if (OPTIONS.length > 0) {
    const had = MEM[PREFIX + "option"] as { n?: number; v?: string } | undefined;
    const empty = !Object.keys(MEM).some((key) => !kept(key.slice(PREFIX.length)));
    if (empty || (!isWorkingCopy() && had?.v !== STAMP)) install(had?.n !== undefined && had.n < OPTIONS.length ? had.n : 0);
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
    const load = () => {
      const slots = readSaved<Slots<C>>(key) || {};
      let name = readSaved<{ name?: ThemeName }>(THEME_KEY)?.name;
      if (!name || !base[name]) name = fallback;
      setTheme(name);
      setColorsState({ ...base[name], ...slots[name] });
      setLoaded(true);
    };
    load();
    return onSync([key, THEME_KEY], load);
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

// A section of a settings panel that folds open and closed, and remembers which.
export function Fold({ id, title, open: openAtFirst = false, children }: { id: string; title: string; open?: boolean; children: React.ReactNode }) {
  const [ui, setUi] = useStored<{ open: boolean }>(`crucible-site:fold:${id}`, { open: openAtFirst });
  return (
    <section className={`fold${ui.open ? " open" : ""}`}>
      <div className="fold-head">
        <button className="fold-title" aria-expanded={ui.open} onClick={() => setUi({ open: !ui.open })}>
          <i>{ui.open ? "−" : "+"}</i> {title}
        </button>
      </div>
      {ui.open && <div className="fold-body">{children}</div>}
    </section>
  );
}

// Settings that are remembered under `key`.
export function useStored<T extends object>(key: string, defaults: T) {
  const [value, setValue] = useState<T>(defaults);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const load = () => {
      const saved = readSaved<Partial<T>>(key);
      if (saved) setValue({ ...defaults, ...saved });
      setLoaded(true);
    };
    load();
    return onSync([key], load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    // Nothing to write when this is what is already saved (for example, just received from another tab).
    if (loaded && JSON.stringify(readSaved(key)) !== JSON.stringify(value)) writeSaved(key, value);
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
//
// The settings are for working on the site, so the button only appears on a
// working copy: this computer, or a branch preview (their addresses contain
// "-git-"). On the live address there is no button, no panel and no timeline.
// Adding ?settings to the live address brings them back for that visit.
export function PanelToggle() {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const ok = isWorkingCopy();
    setWorking(ok);
    if (!ok) return;
    const saved = readSaved<{ open?: boolean }>(PREFIX + "panel");
    if (saved?.open) setOpen(true);
  }, []);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-panel", open);
  }, [open]);
  if (!working) return null;
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

// Option 1, 2, 3: swaps the whole look for one of the saved options. The page
// loads again with the new look and goes straight in, without the enter screen.
export const SKIP_GATE = "crucible-site-skip-gate";
export function OptionSwitch() {
  const [current, setCurrent] = useState(-1);
  useEffect(() => {
    if (OPTIONS.length < 2) return;
    setCurrent(readSaved<{ n?: number }>(PREFIX + "option")?.n ?? -1);
    document.documentElement.setAttribute("data-options", "");
  }, []);
  if (OPTIONS.length < 2) return null;
  return (
    <div className="options" role="group" aria-label="Options">
      <span>Option</span>
      {OPTIONS.map((_, n) => (
        <button
          key={n}
          aria-pressed={n === current}
          onClick={() => {
            if (n === current) return;
            // On a working copy, keep what was there, so a swap never loses unsaved work.
            try {
              localStorage.setItem("crucible-site-before-swap", shareLink());
              sessionStorage.setItem(SKIP_GATE, "1");
            } catch {}
            install(n);
            location.reload();
          }}
        >
          {n + 1}
        </button>
      ))}
    </div>
  );
}
