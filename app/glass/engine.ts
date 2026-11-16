// The window tool's drawing engine.
//
// A window SVG is split into three layers (stone, symbol, leading), each
// turned into a distance map: for every pixel, how far it is from the edge of
// that layer. Everything the tool does is then cheap arithmetic on those
// maps, so the picture can be redrawn live as the sliders move:
//
//   weight, outline, moulding  ->  read the stone map at a different distance
//   wobble                     ->  read the maps a few pixels off, by a slow noise
//   soften + grain + threshold ->  the Photoshop process: give the line a soft
//                                  edge and some tooth, then cut it at a level
//   leading patterns           ->  the distance to the nearest lattice line

export type Settings = {
  stone: string; // "solid" or "outline"
  weight: number; // grows or shrinks the stone
  line: number; // outline thickness
  mould: number; // distance of a second inner line; 0 = none
  symbolSolid: number; // 1 = the symbol stays solid when the stone is outline
  soft: number; // softness of the edge before the cut
  grain: number; // tooth added before the cut
  grainSize: number;
  breaks: number; // uneven tone: thins the line and breaks it in places
  wobble: number; // how far the line wanders
  wobbleLen: number; // how slowly it wanders
  level: number; // the threshold level
  seed: number;
  pattern: string; // "none", "diamond", "grid" or "rays"
  own: number; // 1 = keep the leading drawn in the file
  leadW: number; // thickness of the leading
  spacing: number; // gap between leading lines
  angle: number; // steepness of the diamonds
  leadFrom: number; // the pattern starts this far down the window
  winTone: number;
  symTone: number;
  leadTone: number;
  echo: number; // how many times the window's outline repeats, stepping back
  echoGap: number; // distance to the first repeat
  echoGrow: number; // how much wider each next gap is
  echoTone: number;
  clear: number; // how much the window hides the cathedral lines behind it
  glass: number; // fill in the glass
  glassColor: string; // "light", "orange" or "ink"
};

export type Layers = {
  w: number;
  h: number;
  k: number; // size of one unit in pixels (the window is 1100 units tall)
  stone: Float32Array;
  symbol: Float32Array | null;
  lead: Float32Array | null;
  leadHalf: number; // half the drawn thickness of the file's own leading
  inside: Float32Array; // the whole window opening, stone included
  cx: number; // centre of the symbol
  cy: number;
  counts: { stone: number; symbol: number; lead: number };
  pad: number; // empty room round the window, in pixels
  bottom: number; // the sill: lowest row of the opening
  frame: Float32Array | null; // the outer frame of the window on its own
  frameAt: number; // which of the strokes is that frame, or -1
  strokes: Stroke[]; // the drawing's own lines, for drawing the window in line by line
};

// One line of the drawing, as points in canvas pixels, in the order it was drawn.
export type Stroke = { pts: Float32Array; width: number; kind: "stone" | "symbol" | "lead"; fill: boolean; i: number };

const UNITS = 1100;
const PAD = 200; // room round the window, in units, for the arches that step back from it

const SHAPES = "path,line,rect,circle,ellipse,polygon,polyline";
type Kind = "stone" | "symbol" | "lead";

// Which layer each shape belongs to. A layer or shape named "symbol",
// "leading" or "stone" (or "tracery", "frame") decides it. Without names:
// thin strokes and small filled shapes are leading, a filled shape with a
// hole cut in it is the symbol, and the rest is stone.
function classify(doc: Document): { kinds: Kind[]; leadStroke: number } {
  const svg = doc.documentElement as unknown as SVGSVGElement;
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden";
  const live = document.importNode(svg, true) as SVGSVGElement;
  host.appendChild(live);
  document.body.appendChild(host);
  const shapes = Array.from(live.querySelectorAll<SVGGraphicsElement>(SHAPES)).filter((e) => !e.closest("defs,mask,clipPath"));
  const vb = live.viewBox.baseVal;
  const area = (vb?.width || 1) * (vb?.height || 1);
  const info = shapes.map((el) => {
    let name = "";
    for (let n: Element | null = el; n && n !== live; n = n.parentElement) name += " " + (n.id || "").toLowerCase() + " " + (n.getAttribute("data-name") || "").toLowerCase();
    const cs = getComputedStyle(el);
    const stroked = cs.stroke !== "none" && parseFloat(cs.strokeWidth) > 0;
    const filled = cs.fill !== "none";
    let box = { width: 0, height: 0 };
    try {
      box = el.getBBox();
    } catch {}
    return { name, sw: stroked ? parseFloat(cs.strokeWidth) : 0, filled, evenodd: cs.fillRule === "evenodd", size: (box.width * box.height) / area };
  });
  document.body.removeChild(host);
  // Leading is the thinnest stroke, when it is clearly thinner than the next.
  const widths = Array.from(new Set(info.map((i) => i.sw).filter((x) => x > 0))).sort((a, b) => a - b);
  const leadMax = widths.length > 1 && widths[0] < widths[1] * 0.5 ? widths[0] : 0;
  let leadStroke = 0;
  const kinds = info.map((i): Kind => {
    let kind: Kind;
    if (/symbol|logo|mark/.test(i.name)) kind = "symbol";
    else if (/lead/.test(i.name)) kind = "lead";
    else if (/stone|tracery|frame/.test(i.name)) kind = "stone";
    else if (i.sw > 0) kind = i.sw <= leadMax ? "lead" : "stone";
    else if (i.filled && i.evenodd) kind = "symbol";
    else if (i.filled) kind = i.size < 0.01 ? "lead" : "stone";
    else kind = "stone";
    if (kind === "lead" && i.sw > leadStroke) leadStroke = i.sw;
    return kind;
  });
  return { kinds, leadStroke };
}

async function raster(text: string, keep: (i: number) => boolean, w: number, h: number, pad: number): Promise<Uint8Array> {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  const shapes = Array.from(svg.querySelectorAll(SHAPES)).filter((e) => !e.closest("defs,mask,clipPath"));
  shapes.forEach((el, i) => {
    if (!keep(i)) el.remove();
  });
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("preserveAspectRatio", "none");
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  const img = new Image();
  await new Promise<void>((ok, fail) => {
    img.onload = () => ok();
    img.onerror = () => fail(new Error("This SVG could not be drawn."));
    img.src = url;
  });
  const c = document.createElement("canvas");
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, pad, pad, w, h);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const out = new Uint8Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  return out;
}

// Distance from every pixel to the nearest pixel where `on` is set.
function distance(on: Uint8Array, w: number, h: number, want: number): Float32Array {
  const INF = 1e12;
  const d = new Float64Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = on[i] === want ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (len: number, get: (q: number) => number, put: (q: number, val: number) => void) => {
    for (let q = 0; q < len; q++) f[q] = get(q);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = 0;
      for (;;) {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s <= z[k] && k > 0) k--;
        else break;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      put(q, (q - p) * (q - p) + f[p]);
    }
  };
  for (let x = 0; x < w; x++) pass(h, (q) => d[q * w + x], (q, val) => (d[q * w + x] = val));
  for (let y = 0; y < h; y++) pass(w, (q) => d[y * w + q], (q, val) => (d[y * w + q] = val));
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(d[i]);
  return out;
}

// Positive inside the shape, negative outside.
function signed(mask: Uint8Array, w: number, h: number): Float32Array {
  const inside = distance(mask, w, h, 0);
  const outside = distance(mask, w, h, 1);
  for (let i = 0; i < inside.length; i++) inside[i] = inside[i] > 0 ? inside[i] - 0.5 : 0.5 - outside[i];
  return inside;
}

export async function loadWindow(text: string, height: number): Promise<Layers> {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.nodeName.toLowerCase() !== "svg") throw new Error("That file is not an SVG.");
  const root = doc.documentElement;
  if (!root.getAttribute("viewBox")) {
    const rw = parseFloat(root.getAttribute("width") || "0");
    const rh = parseFloat(root.getAttribute("height") || "0");
    if (!rw || !rh) throw new Error("The SVG has no size.");
    root.setAttribute("viewBox", `0 0 ${rw} ${rh}`);
    text = new XMLSerializer().serializeToString(root);
  }
  const [, , vw, vh] = root.getAttribute("viewBox")!.split(/[\s,]+/).map(Number);
  const k = height / UNITS;
  const pad = Math.round(PAD * k);
  const ih = Math.round(height);
  const iw = Math.round((height * vw) / vh);
  const { kinds, leadStroke } = classify(doc);
  const has = (kind: Kind) => kinds.includes(kind);
  const w = iw + pad * 2;
  const h = ih + pad * 2;
  const stoneMask = await raster(text, (i) => kinds[i] !== "lead", iw, ih, pad);
  const symbolMask = has("symbol") ? await raster(text, (i) => kinds[i] === "symbol", iw, ih, pad) : null;
  const leadMask = has("lead") ? await raster(text, (i) => kinds[i] === "lead", iw, ih, pad) : null;

  // The glass: everything the outside cannot reach without crossing stone.
  const reach = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!reach[i] && !stoneMask[i]) {
      reach[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  const insideMask = new Uint8Array(w * h);
  for (let i = 0; i < insideMask.length; i++) insideMask[i] = reach[i] ? 0 : 1;

  let bottom = 0;
  for (let i = insideMask.length - 1; i >= 0; i--)
    if (insideMask[i]) {
      bottom = (i / w) | 0;
      break;
    }
  let cx = w / 2;
  let cy = h * 0.3;
  if (symbolMask) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < symbolMask.length; i++)
      if (symbolMask[i]) {
        sx += i % w;
        sy += (i / w) | 0;
        n++;
      }
    if (n) {
      cx = sx / n;
      cy = sy / n;
    }
  }
  // The outer frame is the stone line that takes up the most room.
  const strokes = trace(doc, kinds, ih / vh, pad);
  let frameAt = -1;
  let most = 0;
  strokes.forEach((st, at) => {
    if (st.kind !== "stone" || st.fill) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let j = 0; j < st.pts.length; j += 2) {
      x0 = Math.min(x0, st.pts[j]);
      x1 = Math.max(x1, st.pts[j]);
      y0 = Math.min(y0, st.pts[j + 1]);
      y1 = Math.max(y1, st.pts[j + 1]);
    }
    const room = (x1 - x0) * (y1 - y0);
    if (room > most) {
      most = room;
      frameAt = at;
    }
  });
  const frameMask = frameAt >= 0 ? await raster(text, (i) => i === strokes[frameAt].i, iw, ih, pad) : null;
  return {
    w,
    h,
    k,
    stone: signed(stoneMask, w, h),
    symbol: symbolMask ? signed(symbolMask, w, h) : null,
    lead: leadMask ? signed(leadMask, w, h) : null,
    leadHalf: ((leadStroke || 6) * (ih / vh)) / 2,
    inside: signed(insideMask, w, h),
    cx,
    cy,
    pad,
    bottom,
    frame: frameMask ? signed(frameMask, w, h) : null,
    frameAt,
    strokes,
    counts: { stone: kinds.filter((x) => x === "stone").length, symbol: kinds.filter((x) => x === "symbol").length, lead: kinds.filter((x) => x === "lead").length },
  };
}

// Follows every line of the drawing and returns its points in canvas pixels.
function trace(doc: Document, kinds: Kind[], scale: number, pad: number): Stroke[] {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden";
  const live = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  const [, , vw, vh] = live.getAttribute("viewBox")!.split(/[\s,]+/).map(Number);
  live.setAttribute("width", String(vw));
  live.setAttribute("height", String(vh));
  host.appendChild(live);
  document.body.appendChild(host);
  const out: Stroke[] = [];
  try {
    // The same list, in the same order, that the kinds were worked out from.
    const shapes = Array.from(live.querySelectorAll<SVGGeometryElement>(SHAPES)).filter((e) => !e.closest("defs,mask,clipPath"));
    shapes.forEach((el, i) => {
      const m = el.getCTM();
      const len = el.getTotalLength?.() || 0;
      if (!m || len < 1) return;
      const n = Math.max(2, Math.ceil(len / 4));
      const pts = new Float32Array((n + 1) * 2);
      for (let j = 0; j <= n; j++) {
        const p = el.getPointAtLength((len * j) / n);
        pts[j * 2] = (m.a * p.x + m.c * p.y + m.e) * scale + pad;
        pts[j * 2 + 1] = (m.b * p.x + m.d * p.y + m.f) * scale + pad;
      }
      const cs = getComputedStyle(el);
      const stroked = cs.stroke !== "none" && parseFloat(cs.strokeWidth) > 0;
      out.push({ pts, width: (stroked ? parseFloat(cs.strokeWidth) : 0) * Math.hypot(m.a, m.b) * scale, kind: kinds[i] || "stone", fill: cs.fill !== "none", i });
    });
  } catch {
    // A drawing that cannot be traced still shows; it just fades in.
  }
  host.remove();
  return out;
}

// ---- noise ----
function rand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth noise around zero: random values on a coarse grid, blended between.
function field(w: number, h: number, cell: number, seed: number, into?: Float32Array, gain = 1): Float32Array {
  const r = rand(seed);
  const gw = Math.ceil(w / cell) + 3;
  const gh = Math.ceil(h / cell) + 3;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = (r() + r() + r() - 1.5) * 2;
  const out = into || new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / cell;
    const y0 = fy | 0;
    let ty = fy - y0;
    ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = x / cell;
      const x0 = fx | 0;
      let tx = fx - x0;
      tx = tx * tx * (3 - 2 * tx);
      const i = y0 * gw + x0;
      const a = grid[i] + (grid[i + 1] - grid[i]) * tx;
      const b = grid[i + gw] + (grid[i + gw + 1] - grid[i + gw]) * tx;
      out[y * w + x] += (a + (b - a) * ty) * gain;
    }
  }
  return out;
}

type Noise = { key: string; wx: Float32Array; wy: Float32Array; tone: Float32Array; grain: Float32Array };
let cache: Noise | null = null;

function noise(L: Layers, S: Settings): Noise {
  const key = [L.w, L.h, S.seed, S.wobbleLen, S.grainSize].join(":");
  if (cache && cache.key === key) return cache;
  const { w, h, k } = L;
  const len = Math.max(4, S.wobbleLen * k);
  const wx = field(w, h, len, S.seed * 7 + 1);
  field(w, h, len * 0.22, S.seed * 7 + 2, wx, 0.3);
  const wy = field(w, h, len, S.seed * 7 + 3);
  field(w, h, len * 0.22, S.seed * 7 + 4, wy, 0.3);
  const tone = field(w, h, 60 * k, S.seed * 7 + 5);
  field(w, h, 14 * k, S.seed * 7 + 6, tone, 0.7);
  const grain = field(w, h, Math.max(1, S.grainSize * k), S.seed * 7 + 7);
  cache = { key, wx, wy, tone, grain };
  return cache;
}

const GLASS: Record<string, [number, number, number]> = { light: [255, 255, 255], orange: [185, 91, 52] };

// A drawn window, before colour: how much ink and glass light each pixel
// has, whether it is inside the opening, and when in the draw-in its ink appears.
export type Frame = { w: number; h: number; ink: Uint8ClampedArray; glass: Uint8ClampedArray; open: Uint8ClampedArray; clear: number; when: Uint8Array; tint: [number, number, number] | null };

// Colours a frame into `out`. `t` runs 0 to 1 through the draw-in: the stone
// rises from the sill to the point of the arch, the symbol follows, then the
// leading spreads out from the symbol while the light comes up.
export function paint(F: Frame, ink: [number, number, number], paper: [number, number, number] | null, t: number, out: ImageData) {
  const px = out.data;
  const tint = F.tint || ink;
  const pr = paper || ink;
  const done = t >= 1;
  const edge = 0.06;
  const glow = done ? 1 : Math.min(1, Math.max(0, (t - 0.25) / 0.75));
  for (let i = 0, o = 0; i < F.ink.length; i++, o += 4) {
    let aInk = F.ink[i] / 255;
    if (!done && aInk > 0) {
      const r = (t * (1 + edge) - F.when[i] / 255) / edge;
      aInk *= r <= 0 ? 0 : r >= 1 ? 1 : r;
    }
    // From the back: the page colour clearing what is behind the window,
    // then the light in the glass, then the ink.
    const aGlass = (F.glass[i] / 255) * glow;
    const aBack = paper ? (F.open[i] / 255) * F.clear * glow : 0;
    const a1 = aGlass + aBack * (1 - aGlass);
    const a = aInk + a1 * (1 - aInk);
    if (a <= 0) {
      px[o + 3] = 0;
      continue;
    }
    const wg = a1 > 0 ? aGlass / a1 : 0;
    const wi = aInk / a;
    px[o] = ink[0] * wi + (tint[0] * wg + pr[0] * (1 - wg)) * (1 - wi);
    px[o + 1] = ink[1] * wi + (tint[1] * wg + pr[1] * (1 - wg)) * (1 - wi);
    px[o + 2] = ink[2] * wi + (tint[2] * wg + pr[2] * (1 - wg)) * (1 - wi);
    px[o + 3] = a * 255;
  }
}

// Draws the window as a frame the size of the layers.
export function draw(L: Layers, S: Settings): Frame {
  const { w, h, k, stone, symbol, lead, inside } = L;
  const N = noise(L, S);
  const F: Frame = { w, h, ink: new Uint8ClampedArray(w * h), glass: new Uint8ClampedArray(w * h), open: new Uint8ClampedArray(w * h), clear: S.clear, when: new Uint8Array(w * h), tint: GLASS[S.glassColor] || null };
  const top = PAD * k;
  const tall = h - top * 2;
  const reach = Math.hypot(w, h) * 0.75;
  const outline = S.stone === "outline";
  const weight = S.weight * k;
  const line = Math.max(0.6, S.line * k);
  const mould = S.mould * k;
  const soft = Math.max(0.35, S.soft * k);
  const wob = S.wobble * k;
  const leadW = Math.max(0.5, S.leadW * k);
  const gap = Math.max(6, S.spacing * k);
  const ang = (S.angle * Math.PI) / 180;
  const nx = Math.cos(ang);
  const ny = Math.sin(ang);
  const fromY = (PAD * k) + S.leadFrom * (h - PAD * k * 2);
  const rays = Math.max(6, Math.round((2 * Math.PI * 220 * k) / gap));
  const step = (Math.PI * 2) / rays;
  const sharp = 2.2;
  const hasPattern = S.pattern !== "none";
  const echoes = Math.round(S.echo);
  const eGap = Math.max(4, S.echoGap * k);
  const eGrow = S.echoGrow * k;
  const eLine = Math.max(0.6, S.line * k);
  let skip = 10 * k + wob * 4 + Math.abs(weight);
  for (let n = 1; n <= echoes; n++) skip += eGap + eGrow * (n - 1);

  const samp = (f: Float32Array, x: number, y: number) => {
    if (x < 0) x = 0;
    else if (x > w - 1.001) x = w - 1.001;
    if (y < 0) y = 0;
    else if (y > h - 1.001) y = h - 1.001;
    const x0 = x | 0;
    const y0 = y | 0;
    const tx = x - x0;
    const ty = y - y0;
    const i = y0 * w + x0;
    const a = f[i] + (f[i + 1] - f[i]) * tx;
    const b = f[i + w] + (f[i + w + 1] - f[i + w]) * tx;
    return a + (b - a) * ty;
  };
  // The Photoshop step: a soft edge, uneven tone and grain, then the cut.
  const cut = (v: number, i: number) => {
    let t = v / soft + 0.5;
    if (t <= -1.5) return 0;
    if (t > 1) t = 1;
    else if (t < 0) t = 0;
    const halo = Math.min(1, Math.max(0, v / (soft * 4) + 0.6));
    t = t * (1 + S.breaks * 0.55 * N.tone[i]) + S.grain * 0.5 * N.grain[i] * halo;
    const a = (t - S.level) * sharp + 0.5;
    return a < 0 ? 0 : a > 1 ? 1 : a;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Well outside the window and its arches: nothing to draw.
      if (inside[(y > L.bottom - 2 ? L.bottom - 2 : y) * w + x] < -skip) continue;
      const sx = x + N.wx[i] * wob;
      const sy = y + N.wy[i] * wob;

      // Stone
      const d = samp(stone, sx, sy) + weight;
      let v = d;
      if (outline) {
        v = line / 2 - Math.abs(d - line / 2);
        if (mould > 0) v = Math.max(v, line * 0.35 - Math.abs(d - mould - line / 2));
      }
      let aStone = cut(v, i);
      let aSym = 0;
      if (symbol) {
        const ds = samp(symbol, sx, sy) + weight;
        if (S.symbolSolid) aSym = cut(ds, i);
        else if (ds > -line) {
          // Inside the symbol, the stone takes the symbol's strength.
          aSym = aStone;
          aStone = 0;
        }
      }

      // Leading, only in the glass
      // Arches stepping back: the window's outline repeated outward. Below
      // the sill they run straight down and fade.
      let aEcho = 0;
      let kEcho = 0;
      if (echoes > 0) {
        const ey = sy > L.bottom - 2 ? L.bottom - 2 : sy;
        const out = -(samp(inside, sx, ey) + weight);
        if (out > eGap * 0.5) {
          let r = 0;
          for (let n = 1; n <= echoes; n++) {
            r += eGap + eGrow * (n - 1);
            const ve = eLine / 2 - Math.abs(out - r);
            if (ve > -soft * 2) {
              let ae = cut(ve, i) * Math.pow(0.8, n - 1);
              if (sy > L.bottom) ae *= Math.max(0, 1 - (sy - L.bottom) / (L.pad * 0.85));
              if (ae > aEcho) {
                aEcho = ae;
                kEcho = n;
              }
            }
          }
        }
      }

      let aLead = 0;
      // The glass is the opening, less the stone (in outline, less its inside too).
      let open = samp(inside, sx, sy) + weight + 0.5;
      open = open < 0 ? 0 : open > 1 ? 1 : open;
      const inGlass = open > 0 && (outline ? d < line / 2 : true);
      const clear = d < 0;
      if (S.own && lead) aLead = cut(samp(lead, sx, sy) + (leadW / 2 - L.leadHalf), i);
      if (hasPattern && inGlass && clear && sy >= fromY) {
        const rx = sx - L.cx;
        let dl: number;
        if (S.pattern === "diamond") {
          const p1 = (rx * nx + sy * ny) / gap;
          const p2 = (-rx * nx + sy * ny) / gap;
          dl = Math.min(Math.abs(p1 - Math.round(p1)), Math.abs(p2 - Math.round(p2))) * gap;
        } else if (S.pattern === "grid") {
          const p1 = rx / gap + 0.5;
          const p2 = (sy - fromY) / (gap * 1.5);
          dl = Math.min(Math.abs(p1 - Math.round(p1)) * gap, Math.abs(p2 - Math.round(p2)) * gap * 1.5);
        } else {
          const ry = sy - L.cy;
          const a = Math.atan2(ry, rx) / step;
          dl = Math.sin(Math.abs(a - Math.round(a)) * step) * Math.sqrt(rx * rx + ry * ry);
        }
        const al = cut(leadW / 2 - dl, i);
        if (al > aLead) aLead = al;
      }

      let aGlass = 0;
      if (inGlass && S.glass > 0) {
        // Brightest round the symbol, falling away down the window.
        const far = Math.sqrt((sx - L.cx) * (sx - L.cx) + (sy - L.cy) * (sy - L.cy)) / (h * 0.85);
        aGlass = S.glass * open * (1 - 0.6 * Math.min(1, far));
      }
      F.glass[i] = aGlass * 255;
      F.open[i] = open * 255;
      const iStone = aStone * S.winTone;
      const iSym = aSym * S.symTone;
      const iLead = aLead * S.leadTone;
      const iEcho = aEcho * S.echoTone;
      const aInk = Math.max(iStone, iSym, iLead, iEcho);
      if (aInk <= 0) continue;
      F.ink[i] = aInk * 255;
      // When this pixel is drawn in.
      let when: number;
      if (iEcho >= iStone && iEcho >= iSym && iEcho >= iLead) when = Math.min(0.9, 0.2 + kEcho * 0.07) * (0.55 + 0.45 * (1 - (y - top) / (h - top)));
      else if (iStone >= iSym && iStone >= iLead) when = 0.55 * (1 - (y - top) / tall);
      else if (iSym >= iLead) when = 0.45 + 0.25 * Math.min(1, Math.hypot(x - L.cx, y - L.cy) / (tall * 0.25));
      else when = 0.55 + 0.45 * Math.min(1, Math.hypot(x - L.cx, y - L.cy) / reach);
      when += N.tone[i] * 0.012;
      F.when[i] = when < 0 ? 0 : when > 1 ? 255 : when * 255;
    }
  }
  return F;
}
