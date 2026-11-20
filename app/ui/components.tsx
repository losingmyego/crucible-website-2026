"use client";

// The website's components. Each one takes its colours, type and sizes from
// app/ui/tokens.css; their styles are in app/ui/ui.css. The /system page
// shows every one of them as it really renders.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, List, X } from "@phosphor-icons/react";
import "./ui.css";

export type Size = "s" | "m" | "l" | "xl";
export type State = "rest" | "hover" | "pressed" | "focus" | "disabled";

// Pass `state` only to hold a component in one state for the /system page.
const held = (state?: State) => (state && state !== "rest" ? { "data-state": state } : {});

// ---- Type ----
export function Header({ size = "m", as: Tag = "h2", children }: { size?: Size; as?: "h1" | "h2" | "h3" | "h4" | "p"; children: React.ReactNode }) {
  return <Tag className={`t-header ${size}`}>{children}</Tag>;
}
export function Subheader({ size = "m", as: Tag = "p", children }: { size?: Size; as?: "h2" | "h3" | "h4" | "h5" | "p"; children: React.ReactNode }) {
  return <Tag className={`t-subheader ${size}`}>{children}</Tag>;
}
export function Body({ size = "m", children }: { size?: Size; children: React.ReactNode }) {
  return <p className={`t-body ${size}`}>{children}</p>;
}
export function Label({ size = "m", children, className = "" }: { size?: Size; children: React.ReactNode; className?: string }) {
  return <span className={`t-label ${size} ${className}`}>{children}</span>;
}

// ---- Buttons ----
export function Button({
  kind = "primary",
  size = "m",
  children,
  icon,
  disabled,
  state,
  onClick,
}: {
  kind?: "primary" | "secondary";
  size?: "m" | "s"; // s: 24px tall, tighter padding
  children: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  state?: State;
  onClick?: () => void;
}) {
  return (
    <button className={`ui-button ${kind}${size === "s" ? " small" : ""}`} disabled={disabled} onClick={onClick} {...held(state)}>
      {children}
      {icon}
    </button>
  );
}

// A link that reads as an action: a label, an underline and an arrow.
// Links that leave the site get the up-right arrow and open in a new tab.
export function LinkButton({ href, children, away, disabled, state }: { href: string; children: React.ReactNode; away?: boolean; disabled?: boolean; state?: State }) {
  const inner = (
    <>
      {children}
      {away ? <ArrowUpRight weight="regular" /> : <ArrowRight weight="regular" />}
    </>
  );
  const props = { className: "ui-link-button", "aria-disabled": disabled || undefined, ...held(state) };
  return away ? (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {inner}
    </a>
  ) : (
    <Link href={href} {...props}>
      {inner}
    </Link>
  );
}

// A link inside a sentence of body text.
export function InlineLink({ href, children, away, disabled, state }: { href: string; children: React.ReactNode; away?: boolean; disabled?: boolean; state?: State }) {
  const props = { className: "ui-link", "aria-disabled": disabled || undefined, ...held(state) };
  return away ? (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  ) : (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

// ---- Navigation ----
export type NavItem = { href: string; label: string; away?: boolean };

// The site's pages. Thoughts lives on Substack, so it opens there.
export const NAV_ITEMS: NavItem[] = [
  { href: "/team", label: "Team" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/library", label: "Library" },
  { href: "https://cruciblecapital.substack.com/", label: "Thoughts", away: true },
];

export function NavLink({ item, current, state, onClick }: { item: NavItem; current?: string; state?: State; onClick?: () => void }) {
  if (item.away)
    return (
      <a className="ui-nav-link" href={item.href} target="_blank" rel="noreferrer" onClick={onClick} {...held(state)}>
        {item.label}
        <ArrowUpRight />
      </a>
    );
  return (
    <Link className="ui-nav-link" href={item.href} aria-current={item.href === current ? "page" : undefined} onClick={onClick} {...held(state)}>
      {item.label}
    </Link>
  );
}

// The header: wordmark at the left (it leads home), the page links beside it.
// In a box narrower than 720px the links fold behind a menu button that opens
// a sheet. `page` makes it the real site header (fixed to the top, sheet
// covering the screen); without it, it sits in place, as on /system.
export function Nav({ items = NAV_ITEMS, current, page, startOpen = false }: { items?: NavItem[]; current?: string; page?: boolean; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  useEffect(() => setOpen(startOpen), [startOpen]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  const links = items.map((item) => <NavLink key={item.href} item={item} current={current} onClick={() => setOpen(false)} />);
  return (
    <div className={`ui-nav-frame${page ? " page" : ""}`}>
      <header className={`ui-nav${page ? " fixed" : ""}`}>
        <Link href="/" className="ui-wordmark" aria-label="Crucible, home" />
        <nav className="ui-nav-links">{links}</nav>
        <button className="ui-menu-button" aria-label={open ? "Close menu" : "Menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X /> : <List />}
        </button>
      </header>
      <nav className={`ui-menu-sheet${open ? " open" : ""}`} aria-hidden={!open}>
        {links}
      </nav>
    </div>
  );
}

// ---- Footer (a first sketch: symbol, the same links, the year) ----
export function Footer({ items = NAV_ITEMS }: { items?: NavItem[] }) {
  return (
    <div className="ui-footer-frame">
      <footer className="ui-footer">
        <Link href="/" className="ui-symbol" aria-label="Crucible, home" />
        <nav className="ui-nav-links">
          {items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>
        <Label size="s" className="small">
          © {new Date().getFullYear()} Crucible
        </Label>
      </footer>
    </div>
  );
}
