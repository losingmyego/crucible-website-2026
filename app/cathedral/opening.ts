// The homepage opening as one clock. The timeline (OpeningTimeline.tsx) writes
// the playhead and each part's start and length here; the window and the light
// rays read it every frame, and the stylesheet reads the same numbers as CSS
// variables. While `on` is false (the window tool, for one) every part keeps
// its own built-in timing.
export type Part = "window" | "cathedral" | "scrim" | "glow" | "text" | "shade" | "rays";

export const opening = {
  on: false,
  time: 0,
  parts: {} as Partial<Record<Part, { at: number; duration: number }>>,
};

// How far through a part the playhead is, 0 to 1.
export function through(part: Part): number {
  const p = opening.parts[part];
  if (!p) return 1;
  if (p.duration <= 0) return opening.time >= p.at ? 1 : 0;
  return Math.max(0, Math.min(1, (opening.time - p.at) / p.duration));
}
