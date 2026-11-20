"use client";

// The /system page: every token and component of the website, shown as it
// really renders, with its name. Numbers and colours shown here are read
// back from the page itself, so they always match app/ui/tokens.css.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CaretDown,
  CaretRight,
  DownloadSimple,
  List,
  Minus,
  Plus,
  SpeakerHigh,
  SpeakerSlash,
  X,
  type Icon as PhosphorIcon,
  type IconWeight,
} from "@phosphor-icons/react";
import { Body, Button, Footer, Header, InlineLink, Label, LinkButton, Nav, NAV_ITEMS, NavLink, Subheader, type Size, type State } from "../ui/components";
import "./specimen.css";

// ---- The theme: a family (which neutral ramp) and a mode (which role map) ----
const FAMILIES = ["gray", "brown", "umber", "olive"] as const;
const MODES = ["dark", "light"] as const;
type Family = (typeof FAMILIES)[number];
type Mode = (typeof MODES)[number];
const THEME_KEY = "crucible-site:system-theme";

// ---- Reading values back from the page ----
const toHex = (css: string) => {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [];
  const rgb = css.startsWith("color(") ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
  return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
};
function readColors(names: string[], within: HTMLElement) {
  const probe = document.createElement("span");
  within.appendChild(probe);
  const out: Record<string, string> = {};
  for (const name of names) {
    probe.style.color = `var(${name})`;
    out[name] = toHex(getComputedStyle(probe).color);
  }
  probe.remove();
  return out;
}
function readVars(names: string[]) {
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const name of names) out[name] = cs.getPropertyValue(name).trim();
  return out;
}

// ---- Colour tokens ----
type Swatch = { name: string; mix: Record<Mode, string>; use: string };
const COLOR_GROUPS: { title: string; note?: string; tokens: Swatch[] }[] = [
  {
    title: "Surfaces",
    tokens: [
      { name: "--surface", mix: { dark: "neutral-800", light: "neutral-0" }, use: "The page" },
      { name: "--surface-raised", mix: { dark: "neutral-700", light: "neutral-50" }, use: "A panel or card lifted off the page" },
      { name: "--surface-inverse", mix: { dark: "neutral-200", light: "neutral-900" }, use: "Primary button fill" },
    ],
  },
  {
    title: "Text",
    tokens: [
      { name: "--text-primary", mix: { dark: "neutral-200", light: "neutral-900" }, use: "Headers, body, anything read first" },
      { name: "--text-secondary", mix: { dark: "neutral-300", light: "neutral-700" }, use: "Nav links at rest (the hero's 70%)" },
      { name: "--text-tertiary", mix: { dark: "neutral-400", light: "neutral-600" }, use: "Captions, small print" },
      { name: "--text-inverse", mix: { dark: "neutral-800", light: "neutral-0" }, use: "Text on a primary button" },
    ],
  },
  {
    title: "Disabled",
    tokens: [
      { name: "--text-disabled", mix: { dark: "neutral-500", light: "neutral-400" }, use: "Text and icons you can't use" },
      { name: "--surface-disabled", mix: { dark: "neutral-700", light: "neutral-100" }, use: "A primary button you can't use" },
    ],
  },
  {
    title: "Lines",
    tokens: [
      { name: "--line", mix: { dark: "neutral-600", light: "neutral-200" }, use: "Dividers, disabled outlines" },
      { name: "--line-strong", mix: { dark: "neutral-500", light: "neutral-400" }, use: "Outlines, link underlines" },
    ],
  },
  {
    title: "States",
    note: "What hover and press lay on top.",
    tokens: [
      { name: "--surface-hover", mix: { dark: "neutral-700", light: "neutral-50" }, use: "Secondary button, hovered" },
      { name: "--surface-pressed", mix: { dark: "neutral-600", light: "neutral-100" }, use: "Secondary button, pressed" },
      { name: "--surface-inverse-hover", mix: { dark: "neutral-300", light: "neutral-800" }, use: "Primary button, hovered" },
      { name: "--surface-inverse-pressed", mix: { dark: "neutral-400", light: "neutral-700" }, use: "Primary button, pressed" },
    ],
  },
  {
    title: "Accent",
    note: "Used only for the keyboard focus ring so far.",
    tokens: [
      { name: "--accent", mix: { dark: "#B95B34", light: "#B95B34" }, use: "Burnt orange, the main accent (kit D10a)" },
      { name: "--focus", mix: { dark: "accent", light: "accent" }, use: "Focus ring" },
    ],
  },
];
const ALL_COLORS = COLOR_GROUPS.flatMap((g) => g.tokens.map((t) => t.name));

// ---- Which colour each part uses in each state ----
type Part = [role: string, token: string];
type StateSpec = Partial<Record<State, Part[]>>;
const STATES: State[] = ["rest", "hover", "pressed", "focus", "disabled"];
const SPECS: Record<"primary" | "secondary" | "linkButton" | "inline" | "nav", StateSpec> = {
  primary: {
    rest: [["Fill", "--surface-inverse"], ["Text", "--text-inverse"]],
    hover: [["Fill", "--surface-inverse-hover"], ["Text", "--text-inverse"]],
    pressed: [["Fill", "--surface-inverse-pressed"], ["Text", "--text-inverse"]],
    focus: [["Fill", "--surface-inverse"], ["Text", "--text-inverse"], ["Ring", "--focus"]],
    disabled: [["Fill", "--surface-disabled"], ["Text", "--text-disabled"]],
  },
  secondary: {
    rest: [["Outline", "--line-strong"], ["Text", "--text-primary"]],
    hover: [["Fill", "--surface-hover"], ["Outline", "--text-primary"], ["Text", "--text-primary"]],
    pressed: [["Fill", "--surface-pressed"], ["Outline", "--text-primary"], ["Text", "--text-primary"]],
    focus: [["Outline", "--line-strong"], ["Text", "--text-primary"], ["Ring", "--focus"]],
    disabled: [["Outline", "--line"], ["Text", "--text-disabled"]],
  },
  linkButton: {
    rest: [["Text", "--text-primary"], ["Underline", "--line-strong"]],
    hover: [["Text", "--text-primary"], ["Underline", "--text-primary"]],
    pressed: [["Text", "--text-secondary"], ["Underline", "--text-secondary"]],
    focus: [["Text", "--text-primary"], ["Underline", "--line-strong"], ["Ring", "--focus"]],
    disabled: [["Text", "--text-disabled"], ["Underline", "--line"]],
  },
  inline: {
    rest: [["Text", "--text-primary"], ["Underline", "--line-strong"]],
    hover: [["Text", "--text-primary"], ["Underline", "--text-primary"]],
    pressed: [["Text", "--text-secondary"], ["Underline", "--text-secondary"]],
    focus: [["Text", "--text-primary"], ["Ring", "--focus"]],
    disabled: [["Text", "--text-disabled"], ["Underline", "--line"]],
  },
  nav: {
    rest: [["Text", "--text-secondary"]],
    hover: [["Text", "--text-primary"]],
    pressed: [["Text", "--text-tertiary"]],
    focus: [["Text", "--text-secondary"], ["Ring", "--focus"]],
  },
};
const STATE_NOTES: Partial<Record<State, string>> = {
  rest: "Rest",
  hover: "Hover",
  pressed: "Pressed",
  focus: "Keyboard focus",
  disabled: "Disabled",
};

// ---- Type ----
const SIZES: Size[] = ["xl", "l", "m", "s"];
const SIZE_NAME: Record<Size, string> = { xl: "Extra large", l: "Large", m: "Medium", s: "Small" };
const TYPE_VARS = [
  "--face-header",
  "--face-subheader",
  "--face-body",
  "--face-label",
  ...["header", "subheader", "body", "label"].flatMap((r) => SIZES.map((s) => `--${r}-${s}`)),
  "--header-weight",
  "--header-line",
  "--header-track",
  "--subheader-weight",
  "--subheader-line",
  "--subheader-track",
  "--body-weight",
  "--body-line",
  "--body-track",
  "--label-line",
  "--label-spacing",
  "--button-height",
  "--button-height-s",
  "--button-padding",
  "--button-padding-s",
  "--icon-s",
  "--icon-m",
  "--icon-l",
];
const face = (v = "") => v.split(",")[0].replace(/["']/g, "").replace(" Variable", "");

// ---- Icons ----
const ICONS: [string, PhosphorIcon, string][] = [
  ["arrow-right", ArrowRight, "Link button, inside the site"],
  ["arrow-up-right", ArrowUpRight, "Leaves the site (Thoughts)"],
  ["arrow-down", ArrowDown, ""],
  ["caret-right", CaretRight, ""],
  ["caret-down", CaretDown, ""],
  ["list", List, "Phone menu, closed"],
  ["x", X, "Phone menu, open"],
  ["plus", Plus, ""],
  ["minus", Minus, ""],
  ["download-simple", DownloadSimple, ""],
  ["speaker-high", SpeakerHigh, "Homepage sound, on"],
  ["speaker-slash", SpeakerSlash, "Homepage sound, off"],
];
const WEIGHTS: IconWeight[] = ["thin", "light", "regular"];

// ---- Things not built yet, for Neesh to choose from ----
const GAPS: [string, string][] = [
  ["Spacing scale", "A short ladder of gaps (for example 4, 8, 16, 24, 40, 64, 104) so the space between things repeats instead of being picked each time."],
  ["Grid and screen sizes", "How many columns a page has, its side margins, and the widths where the layout changes. Today there is one switch, at 720px, for phones."],
  ["Headers on phones", "Whether the header sizes shrink on a phone. Header XL is 72px everywhere for now."],
  ["Motion", "Named speeds and curves for things that fade, slide or appear. The hero already has two curves (ease-out and ease-soft) that could become the set."],
  ["Where the accent goes", "Burnt orange is only on the focus ring now. It could also mark the current page, a hovered link, or nothing else at all."],
  ["Supporting accents", "Still open in the brand kit, so none here yet."],
  ["Form fields", "An email field and its states, if a newsletter or contact form is planned."],
  ["Image and caption", "How a picture sits on the page and the small text under it."],
];

// =====================================================================

function Chip({ token, hex }: { token: string; hex?: string }) {
  return (
    <span className="sys-chip">
      <i style={{ background: `var(${token})` }} />
      <b>{token.slice(2)}</b>
      {hex && <em>{hex}</em>}
    </span>
  );
}

function SectionHead({ n, title, children }: { n: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="sys-head">
      <Label size="s" className="sys-dim">
        {n}
      </Label>
      <Label size="l">{title}</Label>
      {children && <p className="sys-note">{children}</p>}
    </div>
  );
}

// One component in every state, side by side, with the colours each state uses.
// The first column is the real thing: hover it, press it, tab to it.
function StateTable({
  name,
  spec,
  hex,
  render,
}: {
  name: string;
  spec: StateSpec;
  hex: Record<string, string>;
  render: (state?: State) => React.ReactNode;
}) {
  const [live, setLive] = useState<State>("rest");
  const states = STATES.filter((s) => spec[s]);
  const track = {
    onPointerEnter: () => setLive("hover"),
    onPointerLeave: () => setLive("rest"),
    onPointerDown: () => setLive("pressed"),
    onPointerUp: () => setLive("hover"),
    onFocus: (e: React.FocusEvent) => (e.target as HTMLElement).matches(":focus-visible") && setLive("focus"),
    onBlur: () => setLive("rest"),
  };
  return (
    <div className="sys-states">
      <div className="sys-states-name">
        <Label size="m">{name}</Label>
      </div>
      <div className="sys-states-row" style={{ gridTemplateColumns: `repeat(${states.length + 1}, minmax(150px, 1fr))` }}>
        <div className="sys-cell try">
          <Label size="s" className="sys-dim">
            Try it
          </Label>
          <div className="sys-stage" {...track}>
            {render()}
          </div>
          <p className="sys-hint">Hover, press, or tab to it</p>
        </div>
        {states.map((s) => (
          <div key={s} className={`sys-cell${live === s ? " lit" : ""}`}>
            <Label size="s" className="sys-dim">
              {STATE_NOTES[s]}
            </Label>
            <div className="sys-stage" inert>
              {render(s)}
            </div>
            <div className="sys-parts">
              {spec[s]!.map(([role, token]) => (
                <div key={role} className="sys-part">
                  <span className="sys-role">{role}</span>
                  <Chip token={token} hex={hex[token]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Specimen() {
  const [family, setFamily] = useState<Family>("gray");
  const [mode, setMode] = useState<Mode>("dark");
  const [hex, setHex] = useState<Record<string, string>>({});
  const [vars, setVars] = useState<Record<string, string>>({});
  const [weight, setWeight] = useState<IconWeight>("regular");
  const [menuOpen, setMenuOpen] = useState(false);
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const [f, m] = (localStorage.getItem(THEME_KEY) ?? "").split(":");
      if (FAMILIES.includes(f as Family)) setFamily(f as Family);
      if (MODES.includes(m as Mode)) setMode(m as Mode);
    } catch {}
  }, []);

  // The family and mode sit on this page's root (data-family, data-mode), so
  // every token inside follows them. Then read every token back.
  useLayoutEffect(() => {
    if (!page.current) return;
    setHex(readColors(ALL_COLORS, page.current));
    setVars(readVars(TYPE_VARS));
    try {
      localStorage.setItem(THEME_KEY, `${family}:${mode}`);
    } catch {}
  }, [family, mode]);

  const v = (name: string) => vars[name] ?? "";

  return (
    <div className="sys" ref={page} data-family={family} data-mode={mode}>
      {/* ---- Top bar ---- */}
      <div className="sys-bar">
        <div className="sys-title">
          <span className="ui-wordmark" aria-hidden />
          <Label size="m" className="sys-dim">
            Design system
          </Label>
        </div>
        <div className="sys-looks" role="group" aria-label="Theme">
          <Label size="s" className="sys-dim">
            Family
          </Label>
          {FAMILIES.map((f) => (
            <button key={f} aria-pressed={f === family} onClick={() => setFamily(f)} title={f}>
              <i style={{ background: `var(--color-${f}-${mode === "dark" ? 800 : 0})`, boxShadow: `inset 0 0 0 4px var(--color-${f}-${mode === "dark" ? 800 : 0}), inset 0 0 0 9px var(--color-${f}-${mode === "dark" ? 200 : 900})` }} />
              <span>{f}</span>
            </button>
          ))}
          <span className="sys-gap-x" />
          {MODES.map((m) => (
            <button key={m} className="sys-toggle" aria-pressed={m === mode} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <main className="sys-main">
        <section className="sys-intro">
          <Header size="l" as="h1">
            Website design system
          </Header>
          <Body size="m">
            Every colour, size and component the site uses, shown as it renders. Switch the family (gray, brown, umber, olive) and the mode (dark, light) at the top right: every
            colour is a step on the family&apos;s 0 to 900 ramp, so nothing needs redoing per theme. Values live in app/ui/tokens.css.
          </Body>
        </section>

        {/* ---- 01 Colour ---- */}
        <section>
          <SectionHead n="01" title="Colour">
            Each token names a step on the active family&apos;s ramp, one map for dark and one for light. Change the step in the map and every component follows.
          </SectionHead>
          <div className="sys-color-groups">
            {COLOR_GROUPS.map((g) => (
              <div key={g.title} className="sys-color-group">
                <Label size="m">{g.title}</Label>
                {g.note && <p className="sys-hint">{g.note}</p>}
                <div className="sys-swatches">
                  {g.tokens.map((t) => (
                    <div key={t.name} className="sys-swatch">
                      <div className="sys-swatch-tile" style={{ background: `var(${t.name})` }}>
                        {t.name.startsWith("--text") && (
                          <span className="sys-aa" style={{ color: `var(${t.name})`, background: t.name === "--text-inverse" ? "var(--surface-inverse)" : "var(--surface)" }}>
                            Aa
                          </span>
                        )}
                      </div>
                      <Label size="s">{t.name.slice(2)}</Label>
                      <span className="sys-meta">
                        {hex[t.name] ?? ""} · {t.mix[mode]}
                      </span>
                      <span className="sys-use">{t.use}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- 02 Type ---- */}
        <section>
          <SectionHead n="02" title="Type">
            Four roles in four sizes. Each size name pairs across the roles: a Header L goes with a Subheader L, a Body L and a Label L.
          </SectionHead>
          <div className="sys-faces">
            {[
              ["Header", face(v("--face-header")), `${v("--header-weight")} weight · line ${v("--header-line")} · spacing ${v("--header-track")}`],
              ["Subheader", face(v("--face-subheader")), `${v("--subheader-weight")} weight · line ${v("--subheader-line")} · spacing ${v("--subheader-track")}`],
              ["Body", face(v("--face-body")), `${v("--body-weight")} weight · line ${v("--body-line")} · spacing ${v("--body-track")}`],
              ["Label", face(v("--face-label")), `all caps · line ${Math.round(Number(v("--label-line")) * 100)}% · spacing ${v("--label-spacing")}`],
            ].map(([role, f, spec]) => (
              <div key={role} className="sys-face">
                <Label size="s" className="sys-dim">
                  {role}
                </Label>
                <span className="sys-face-name">{f}</span>
                <span className="sys-meta">{spec}</span>
              </div>
            ))}
          </div>
          <div className="sys-type">
            {SIZES.map((s) => (
              <div key={s} className="sys-type-row">
                <div className="sys-type-size">
                  <Label size="l">{s.toUpperCase()}</Label>
                  <span className="sys-meta">{SIZE_NAME[s]}</span>
                </div>
                <div className="sys-type-sample">
                  <div className="sys-type-item">
                    <span className="sys-meta">
                      header-{s} · {v(`--header-${s}`)}
                    </span>
                    <Header size={s} as="p">
                      Header {s.toUpperCase()}
                    </Header>
                  </div>
                  <div className="sys-type-item">
                    <span className="sys-meta">
                      subheader-{s} · {v(`--subheader-${s}`)}
                    </span>
                    <Subheader size={s}>Subheader {s.toUpperCase()}, smaller than every header</Subheader>
                  </div>
                  <div className="sys-type-item">
                    <span className="sys-meta">
                      body-{s} · {v(`--body-${s}`)}
                      {s === "m" ? " · the homepage text" : ""}
                    </span>
                    <Body size={s}>
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio praesent libero, sed cursus ante dapibus diam. Sed nisi nulla quis sem at nibh
                      elementum imperdiet.
                    </Body>
                  </div>
                  <div className="sys-type-item">
                    <span className="sys-meta">
                      label-{s} · {v(`--label-${s}`)}
                    </span>
                    <Label size={s}>Label {s.toUpperCase()} · 01 · Portfolio</Label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- 03 Buttons ---- */}
        <section>
          <SectionHead n="03" title="Buttons">
            Two styles in two sizes, with square corners. Medium is 32px tall with Label M type; small is 24px with Label S. The column you are acting on in &quot;Try it&quot; lights up.
          </SectionHead>
          <StateTable name="Primary button" spec={SPECS.primary} hex={hex} render={(s) => <Button kind="primary" state={s} disabled={s === "disabled"}>Primary</Button>} />
          <StateTable
            name="Secondary button"
            spec={SPECS.secondary}
            hex={hex}
            render={(s) => (
              <Button kind="secondary" state={s} disabled={s === "disabled"}>
                Secondary
              </Button>
            )}
          />
          <div className="sys-sizes">
            <Label size="m">Sizes</Label>
            <div className="sys-sizes-row">
              {(["m", "s"] as const).map((sz) => (
                <div key={sz} className="sys-size">
                  <div className="sys-size-buttons">
                    <Button kind="primary" size={sz}>
                      Primary
                    </Button>
                    <Button kind="secondary" size={sz}>
                      Secondary
                    </Button>
                  </div>
                  <Label size="s">{sz === "m" ? "Medium (default)" : "Small"}</Label>
                  <span className="sys-meta">
                    {sz === "m"
                      ? `button-height ${v("--button-height")} · padding ${v("--button-padding")} · label-m`
                      : `button-height-s ${v("--button-height-s")} · padding ${v("--button-padding-s")} · label-s`}
                  </span>
                </div>
              ))}
            </div>
            <p className="sys-hint">Both sizes use the same colours in every state, shown in the tables above.</p>
          </div>
        </section>

        {/* ---- 04 Links ---- */}
        <section>
          <SectionHead n="04" title="Links">
            A link button stands on its own as an action. An inline link sits inside a sentence. Links that leave the site get the up-right arrow.
          </SectionHead>
          <StateTable
            name="Link button"
            spec={SPECS.linkButton}
            hex={hex}
            render={(s) => (
              <LinkButton href="#" state={s} disabled={s === "disabled"}>
                Read more
              </LinkButton>
            )}
          />
          <StateTable
            name="Inline link"
            spec={SPECS.inline}
            hex={hex}
            render={(s) => (
              <p className="t-body m">
                Lorem ipsum{" "}
                <InlineLink href="#" state={s} disabled={s === "disabled"}>
                  dolor sit
                </InlineLink>{" "}
                amet.
              </p>
            )}
          />
          <div className="sys-row-note">
            <Label size="s" className="sys-dim">
              Leaving the site
            </Label>
            <LinkButton href="https://cruciblecapital.substack.com/" away>
              Thoughts
            </LinkButton>
          </div>
        </section>

        {/* ---- 05 Icons ---- */}
        <section>
          <SectionHead n="05" title="Icons">
            Phosphor, the set the homepage sound button already uses. Three sizes. The line weight is yours to pick; the site uses regular today.
          </SectionHead>
          <div className="sys-controls">
            <Label size="s" className="sys-dim">
              Weight
            </Label>
            {WEIGHTS.map((w) => (
              <button key={w} className="sys-toggle" aria-pressed={w === weight} onClick={() => setWeight(w)}>
                {w}
              </button>
            ))}
          </div>
          <div className="sys-icon-sizes">
            {(["s", "m", "l"] as const).map((s) => (
              <div key={s} className="sys-icon-size">
                <ArrowUpRight className={`ui-icon ${s}`} weight={weight} />
                <Label size="s">icon-{s}</Label>
                <span className="sys-meta">{v(`--icon-${s}`)}</span>
              </div>
            ))}
          </div>
          <div className="sys-icons">
            {ICONS.map(([name, I, use]) => (
              <div key={name} className="sys-icon">
                <I className="ui-icon l" weight={weight} />
                <span className="sys-meta">{name}</span>
                {use && <span className="sys-use">{use}</span>}
              </div>
            ))}
          </div>
        </section>

        {/* ---- 06 Navigation ---- */}
        <section>
          <SectionHead n="06" title="Navigation">
            One component. Wider than 720px it shows the links; narrower, they fold behind the menu button. The links and their order are a list you can change in one place.
          </SectionHead>
          <Label size="s" className="sys-dim sys-sub">
            Desktop · current page: Team
          </Label>
          <div className="sys-frame">
            <Nav current="/team" />
          </div>
          <div className="sys-phones">
            <div>
              <div className="sys-sub-row">
                <Label size="s" className="sys-dim">
                  Phone · 390px
                </Label>
                <button className="sys-toggle" aria-pressed={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                  {menuOpen ? "close menu" : "open menu"}
                </button>
              </div>
              <div className="sys-frame phone">
                <Nav current="/team" startOpen={menuOpen} />
              </div>
            </div>
          </div>
          <StateTable name="Nav link" spec={SPECS.nav} hex={hex} render={(s) => <NavLink item={NAV_ITEMS[1]} state={s} />} />
          <div className="sys-row-note">
            <Label size="s" className="sys-dim">
              Current page
            </Label>
            <NavLink item={NAV_ITEMS[0]} current="/team" />
            <Chip token="--text-primary" hex={hex["--text-primary"]} />
          </div>
        </section>

        {/* ---- 07 Footer ---- */}
        <section>
          <SectionHead n="07" title="Footer">
            Not on the site yet. A first sketch built only from parts above (the symbol, the nav links, a small label over a divider), for you to react to.
          </SectionHead>
          <div className="sys-frame">
            <Footer />
          </div>
          <div className="sys-phones">
            <div>
              <Label size="s" className="sys-dim sys-sub">
                Phone · 390px
              </Label>
              <div className="sys-frame phone short">
                <Footer />
              </div>
            </div>
          </div>
        </section>

        {/* ---- 08 Not built ---- */}
        <section>
          <SectionHead n="08" title="Not built yet">
            Things a system like this often has. None are in. Pick the ones you want.
          </SectionHead>
          <div className="sys-gaps">
            {GAPS.map(([title, text]) => (
              <div key={title} className="sys-gap">
                <Label size="m">{title}</Label>
                <p className="t-body s">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
