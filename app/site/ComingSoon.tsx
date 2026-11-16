"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BASE_COLORS } from "../SandText";
import { THEME_KEY, readSaved } from "../lab";
import SiteNav from "./SiteNav";

// A page that is not built yet: the header, the lockup (which leads home) and two words.
// It takes the colours chosen on the homepage so the pages match.
export default function ComingSoon({ current }: { current: string }) {
  useEffect(() => {
    const name = (readSaved<{ name?: keyof typeof BASE_COLORS }>(THEME_KEY)?.name ?? "medium") as keyof typeof BASE_COLORS;
    const home = readSaved<Record<string, { paper?: string; ink?: string }>>("crucible-site:colors-home") || {};
    const picked = { ...(BASE_COLORS[name] ?? {}), ...(home[name] ?? {}) } as { paper?: string; ink?: string };
    const root = document.documentElement.style;
    if (picked.paper) root.setProperty("--paper", picked.paper);
    if (picked.ink) root.setProperty("--ink", picked.ink);
  }, []);
  return (
    <>
      <SiteNav current={current} />
      <main className="soon">
        <Link href="/" className="soon-mark" aria-label="Crucible, home" />
        <p>Coming soon</p>
      </main>
    </>
  );
}
