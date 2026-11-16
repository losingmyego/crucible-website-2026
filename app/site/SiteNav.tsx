import Link from "next/link";

// The site's pages. Thoughts lives on Substack, so it opens there.
export const PAGES = [
  { href: "/team", label: "Team" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/library", label: "Library" },
  { href: "https://cruciblecapital.substack.com/", label: "Thoughts", away: true },
];

export default function SiteNav({ current }: { current?: string }) {
  return (
    <header className="cathedral-bar">
      <nav>
        {PAGES.map((p) =>
          p.away ? (
            <a key={p.href} href={p.href} target="_blank" rel="noreferrer">
              {p.label}
            </a>
          ) : (
            <Link key={p.href} href={p.href} aria-current={p.href === current ? "page" : undefined}>
              {p.label}
            </Link>
          ),
        )}
      </nav>
    </header>
  );
}
