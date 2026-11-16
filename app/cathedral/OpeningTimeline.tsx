"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { DialTimeline, useDialTimeline, type TimelineConfig } from "dialkit";
import "dialkit/styles.css";
import { opening, type Part } from "./opening";

// When each part of the opening arrives and how long it takes, in seconds.
// These are Neesh's timings of 2026-11-16; the dock at the bottom of the page moves them.
const CLIPS = {
  window: { at: 0.39, duration: 3.58 },
  glass: { at: 2.07, duration: 2.18 },
  cathedral: { at: 0, duration: 2.9 },
  scrim: { at: 1.03, duration: 1.7 },
  glow: { at: 3.18, duration: 2.8 },
  text: { at: 2.56, duration: 3.94 },
  shade: { at: 0.02, duration: 1.64 },
  rays: { at: 1.65, duration: 3.46 },
} satisfies TimelineConfig;

const PARTS = Object.keys(CLIPS) as Part[];

// Runs the opening from a DialKit timeline. `go` starts it. The dock shows
// whenever the settings panel is open.
export default function OpeningTimeline({ go }: { go: boolean }) {
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline("Opening", CLIPS, { id: "crucible-opening", persist: true, autoplay: false });
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setPanel(root.hasAttribute("data-panel"));
    read();
    const watch = new MutationObserver(read);
    watch.observe(root, { attributes: true, attributeFilter: ["data-panel"] });
    return () => watch.disconnect();
  }, []);

  // Tell the page how tall the dock is, so the settings panel can sit above it.
  useEffect(() => {
    const root = document.documentElement;
    if (!panel) return;
    let seen: ResizeObserver | null = null;
    const find = window.setInterval(() => {
      const dock = document.querySelector<HTMLElement>(".dialkit-timeline");
      if (!dock) return;
      window.clearInterval(find);
      seen = new ResizeObserver(() => root.style.setProperty("--dock-h", `${Math.round(dock.getBoundingClientRect().height)}px`));
      seen.observe(dock);
    }, 100);
    return () => {
      window.clearInterval(find);
      seen?.disconnect();
      root.style.removeProperty("--dock-h");
    };
  }, [panel]);

  // Hand the playhead and the timings to the page, before it paints.
  useLayoutEffect(() => {
    const root = document.documentElement;
    opening.on = true;
    opening.time = timeline.time;
    root.setAttribute("data-timeline", "");
    root.style.setProperty("--t", `${timeline.time}s`);
    for (const name of PARTS) {
      const clip = timeline[name];
      opening.parts[name] = { at: clip.at, duration: clip.duration };
      root.style.setProperty(`--${name}-at`, `${clip.at}s`);
      root.style.setProperty(`--${name}-for`, `${Math.max(0.01, clip.duration)}s`);
    }
  });
  useEffect(
    () => () => {
      const root = document.documentElement;
      opening.on = false;
      root.removeAttribute("data-timeline");
      root.style.removeProperty("--t");
      for (const name of PARTS) {
        root.style.removeProperty(`--${name}-at`);
        root.style.removeProperty(`--${name}-for`);
      }
    },
    [],
  );

  // Count the words on screen, so the text's bar covers exactly the words you can see.
  useEffect(() => {
    if (!go) return;
    const count = () => {
      let n = 0;
      for (const el of document.querySelectorAll<HTMLElement>(".column p > span")) {
        const box = el.getBoundingClientRect();
        if (box.top < window.innerHeight && box.bottom > 0) n = Math.max(n, Number(el.style.getPropertyValue("--i")) || 0);
      }
      document.documentElement.style.setProperty("--text-n", String(Math.max(1, n)));
    };
    count();
    window.addEventListener("resize", count);
    return () => {
      window.removeEventListener("resize", count);
      document.documentElement.style.removeProperty("--text-n");
    };
  }, [go]);

  useEffect(() => {
    if (go) timeline.replay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);

  // Once it has played through, the dust is told to measure where the words ended up.
  const playing = timeline.playing;
  useEffect(() => {
    if (go && !playing) window.dispatchEvent(new Event("resize"));
  }, [go, playing]);

  return <DialTimeline productionEnabled visible={panel} theme="dark" />;
}
