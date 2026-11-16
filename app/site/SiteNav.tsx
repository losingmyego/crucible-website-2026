"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// The site's pages. Thoughts lives on Substack, so it opens there.
export const PAGES = [
  { href: "/team", label: "Team" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/library", label: "Library" },
  { href: "https://cruciblecapital.substack.com/", label: "Thoughts", away: true },
];

export default function SiteNav({ current }: { current?: string }) {
  // On a phone the links are folded away behind a menu button at the right.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", key);
    document.documentElement.setAttribute("data-menu", "");
    return () => {
      window.removeEventListener("keydown", key);
      document.documentElement.removeAttribute("data-menu");
    };
  }, [open]);
  const links = PAGES.map((p) =>
    p.away ? (
      <a key={p.href} href={p.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
        {p.label}
      </a>
    ) : (
      <Link key={p.href} href={p.href} aria-current={p.href === current ? "page" : undefined} onClick={() => setOpen(false)}>
        {p.label}
      </Link>
    ),
  );
  return (
    <>
      <header className="cathedral-bar">
        <Link href="/" className="bar-word" aria-label="Crucible, home" />
        <nav>{links}</nav>
      </header>
      <button className={`menu-button${open ? " open" : ""}`} aria-label={open ? "Close menu" : "Menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
        <i />
        <i />
        <i />
      </button>
      <nav className={`menu-sheet${open ? " open" : ""}`} aria-hidden={!open}>
        {links}
      </nav>
    </>
  );
}
