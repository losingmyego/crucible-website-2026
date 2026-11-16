// The drawn cathedral.
//
// A nave in one-point perspective, built from the window's own outline: the
// same arch repeated larger and larger toward the viewer, all scaled about one
// vanishing point behind the window. Between the arches run the vault ribs,
// the walls with their side windows, and the floor. Everything is drawn as
// fine lines with a little wander and a few breaks, like the original.
//
// Distances are in window heights: the sill is y = 0, the point of the arch
// is y = -1, and x = 0 is the middle of the window.

import type { Layers } from "./engine";

export type Outline = {
  left: Float32Array; // x,y pairs from the sill up to the point, left side
  right: Float32Array; // the same on the right
  hw: number; // half the width of the opening
  spring: number; // height where the sides start to curve
  ratio: number; // height of the opening over the height of the drawing
  sill: number; // where the sill sits in the drawing, 0 to 1 from its top
  dx: number; // how far the opening's middle is off the drawing's middle
};

export type NaveLook = {
  naveBay: number; // how much larger each next arch is, near the window
  naveBayFar: number; // the same, at the front of the view
  naveWide: number; // width of the nave against the window: room beside it
  naveLift: number; // how far the arches are raised to match the room beside the window
  naveClear: number; // how far from the window the lines take to fade in
  naveMould: number; // spread of the lines that make up each arch
  naveRibs: number; // vault ribs on each side
  naveSides: number; // side windows, 0 or 1
  naveDrop: number; // how far the floor is below the sill
  naveEye: number; // height of the vanishing point above the sill
  naveWobble: number;
  naveBreaks: number;
  naveGlow: number; // how much brighter the lines are near the window
  naveDetail: number; // machine detail: slots, panels, ladders, pipes, traces
  naveBold: number; // how many lines are drawn heavy
  // The machine parts, each with its own amount (0 = none).
  mRings: number; // extra hairlines in each arch
  mLadders: number; // rows of short ticks across the arch bands
  mSlots: number; // rounded openings in the vault
  mPipes: number; // runs of parallel lines along the walls, with clamps
  mPanels: number; // boxes with studs on the walls
  mTraces: number; // jogged lines ending in a stud
  mPlates: number; // plates set into the floor
  // How the machine parts are drawn.
  mTone: number; // their strength against the arches
  mWeight: number; // their line weight
  mCorner: number; // 0 square corners, 1 fully round
  mSize: number; // size of slots and panels
  mSeed: number; // reshuffles where the parts fall
};

// The outline of the window's opening, read from its distance map.
export function outlineOf(L: Layers): Outline {
  const { w, inside, pad } = L;
  const rows: [number, number, number][] = [];
  for (let y = L.bottom; y >= 0; y--) {
    let xl = -1;
    let xr = -1;
    for (let x = 0; x < w; x++)
      if (inside[y * w + x] > 0) {
        xl = x + 0.5 - Math.min(1.5, inside[y * w + x]);
        break;
      }
    if (xl < 0) {
      if (rows.length) break;
      continue;
    }
    for (let x = w - 1; x >= 0; x--)
      if (inside[y * w + x] > 0) {
        xr = x + 0.5 + Math.min(1.5, inside[y * w + x]);
        break;
      }
    rows.push([y, xl, xr]);
  }
  const n = rows.length;
  const H = n - 1 || 1;
  let mid = 0;
  for (const r of rows) mid += (r[1] + r[2]) / 2;
  mid /= n;
  // Every third row, smoothed over a few neighbours.
  const pick: number[] = [];
  for (let i = 0; i < n; i += 3) pick.push(i);
  if (pick[pick.length - 1] !== n - 1) pick.push(n - 1);
  const left = new Float32Array(pick.length * 2);
  const right = new Float32Array(pick.length * 2);
  let hw = 0;
  pick.forEach((i, j) => {
    let l = 0;
    let r = 0;
    let c = 0;
    for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) {
      l += rows[k][1];
      r += rows[k][2];
      c++;
    }
    const half = Math.max(0, (r / c - l / c) / 2 / H);
    left[j * 2] = -half;
    left[j * 2 + 1] = -i / H;
    right[j * 2] = half;
    right[j * 2 + 1] = -i / H;
    if (half > hw) hw = half;
  });
  // Close the point.
  left[left.length - 2] = 0;
  right[right.length - 2] = 0;
  let spring = -0.5;
  for (let j = 0; j < pick.length; j++)
    if (right[j * 2] < hw * 0.985) {
      spring = right[j * 2 + 1];
      break;
    }
  const tall = L.h - pad * 2;
  return { left, right, hw, spring, ratio: H / tall, sill: (L.bottom - pad) / tall, dx: (mid - w / 2) / tall };
}

// A steady random number for a line and a place along it.
function hash(a: number, b: number) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth noise along a line, around zero.
function drift(key: number, t: number) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return (hash(key, i) + (hash(key, i + 1) - hash(key, i)) * u) * 2 - 1;
}

export type Scene = {
  width: number; // canvas size in pixels
  height: number;
  cx: number; // middle of the window
  sillY: number; // the sill
  H: number; // height of the opening
  px: number; // one screen pixel
};

export function drawNave(g: CanvasRenderingContext2D, O: Outline, S: NaveLook, scene: Scene, ink: string, strength: number, walk: number, t: number) {
  const { width, height, cx, sillY, H, px } = scene;
  g.clearRect(0, 0, width, height);
  if (strength <= 0) return;
  g.strokeStyle = ink;
  g.lineCap = "round";
  g.lineJoin = "round";
  const eye = -S.naveEye; // the vanishing point
  const floor = S.naveDrop;
  const wide = Math.max(1, S.naveWide);
  const hw = O.hw * wide;
  const wob = S.naveWobble * px;
  // Widening the nave leaves room beside the window; raise the arch by the
  // same amount (times naveLift) so there is matching room above it.
  const rise = O.hw * (wide - 1) * (S.naveLift ?? 1);
  const lifted = (side: Float32Array) => {
    const out = new Float32Array(side);
    for (let i = 1; i < out.length; i += 2) out[i] -= rise * Math.min(1, Math.max(0, out[i] / O.spring));
    return out;
  };
  const LEFT = lifted(O.left);
  const RIGHT = lifted(O.right);
  const detail = S.naveDetail;
  const X = (s: number, x: number) => cx + H * s * x * wide;
  const Y = (s: number, y: number) => sillY + H * (eye + s * (y - eye));
  // How far out the nave has to go to pass the corners of the screen.
  const reach = (Math.max(cx, width - cx) / (H * hw)) * 1.2;
  // The size of the arch `u` bays out from the window. The step from one
  // arch to the next changes from the near spacing to the far spacing.
  const near = Math.log(Math.max(1.03, S.naveBay));
  const far = Math.log(Math.max(1.03, S.naveBayFar));
  const U = 7;
  const first = 1.02;
  const scaleAt = (u: number) => {
    if (u <= 0) return first * Math.exp(near * u);
    if (u <= U) return first * Math.exp(near * u + ((far - near) * u * u) / (2 * U));
    return first * Math.exp(near * U + ((far - near) * U) / 2 + far * (u - U));
  };
  const shift = walk - Math.floor(walk);
  const base = Math.floor(walk);

  // One line, with a little wander and a few breaks. `key` keeps it the same
  // from frame to frame.
  const pts: number[] = [];
  // Machine parts are drawn at their own strength and weight.
  let tone = 1;
  let heavy = 1;
  const machine = (on: boolean) => {
    tone = on ? S.mTone : 1;
    heavy = on ? S.mWeight : 1;
  };
  // While the cathedral is being sketched in, `pen` is how far the pen has got
  // through the bay being drawn, and `back` says its lines are drawn from their
  // near end toward the window. Each line starts a little after the last.
  let pen = 1;
  let back = false;
  const sketch = (key: number, alpha: number, widthPx: number, shown = pen) => {
    const n = pts.length / 2;
    if (shown < 1) shown = (shown - hash(key, 77) * 0.45) / 0.55;
    const last = Math.max(1, Math.floor((n - 1) * Math.min(1, shown)));
    if (alpha <= 0.004 || n < 2 || shown <= 0) {
      pts.length = 0;
      return;
    }
    const from = back ? n - 1 - last : 0;
    const to = back ? n - 1 : last;
    alpha *= tone;
    widthPx *= heavy;
    // Some lines are drawn heavy, as in the original.
    if (S.naveBold > 0 && hash(key, 911) < S.naveBold * 0.22) {
      widthPx *= 2.1;
      alpha *= 1.5;
    }
    g.lineWidth = widthPx * px;
    let open = false;
    let run = 0;
    for (let i = from; i <= to; i++) {
      const gap = S.naveBreaks > 0 && drift(key * 7 + 3, i / 9) > 1 - S.naveBreaks * 0.55;
      if (gap) {
        if (open) g.stroke();
        open = false;
        continue;
      }
      const x = pts[i * 2] + drift(key * 7 + 1, i / 11) * wob;
      const y = pts[i * 2 + 1] + drift(key * 7 + 2, i / 11) * wob;
      if (!open || run > 14) {
        if (open) {
          g.lineTo(x, y);
          g.stroke();
        }
        g.globalAlpha = Math.min(1, alpha * (0.72 + 0.28 * (drift(key * 7 + 4, i / 14) + 1)));
        g.beginPath();
        g.moveTo(x, y);
        open = true;
        run = 0;
      } else g.lineTo(x, y);
      run++;
    }
    if (open) g.stroke();
    pts.length = 0;
  };
  // A straight line, cut into short steps so it can wander too.
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (16 * px)));
    for (let i = 0; i <= steps; i++) pts.push(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
  };
  // One side of an arch at scale `s`, from the floor up to the point.
  const half = (side: Float32Array, s: number) => {
    const fx = X(s, side[0]);
    line(fx, Y(s, floor), fx, Y(s, 0));
    for (let i = 2; i < side.length; i += 2) pts.push(X(s, side[i]), Y(s, side[i + 1]));
  };
  // A point on the roof: `i` counts along one side of the arch (may be a fraction).
  const nSide = LEFT.length / 2;
  const roof = (side: Float32Array, i: number, s: number) => {
    const i0 = Math.max(0, Math.min(nSide - 2, Math.floor(i)));
    const f = i - i0;
    pts.push(X(s, side[i0 * 2] + (side[i0 * 2 + 2] - side[i0 * 2]) * f), Y(s, side[i0 * 2 + 1] + (side[i0 * 2 + 3] - side[i0 * 2 + 1]) * f));
  };
  // A rounded slot or panel in a patch of roof, wall or floor. `at(u, v)`
  // places a point; u and v run 0 to 1 across the patch.
  const shape = (at: (u: number, v: number) => void, u0: number, u1: number, v0: number, v1: number, round: number) => {
    const r = Math.min(0.5, round * S.mCorner * 2);
    const corner = (cu: number, cv: number, a0: number) => {
      for (let k = 0; k <= 4; k++) {
        const a = a0 + (k / 4) * (Math.PI / 2);
        at(u0 + (u1 - u0) * (cu + Math.cos(a) * r), v0 + (v1 - v0) * (cv + Math.sin(a) * r));
      }
    };
    corner(1 - r, 1 - r, 0);
    corner(r, 1 - r, Math.PI / 2);
    corner(r, r, Math.PI);
    corner(1 - r, r, Math.PI * 1.5);
    at(u0 + (u1 - u0) * 1, v0 + (v1 - v0) * (1 - r));
  };
  // Fades in as it leaves the window; brighter near it.
  const clear = Math.max(0.03, S.naveClear);
  const lit = (s: number) => strength * 1.25 * (1 + S.naveGlow * 1.6 * Math.exp(-(Math.max(1, s) - 1) * 1.1));
  const fadeIn = (s: number) => {
    const f = Math.min(1, Math.max(0, (s - 1) / clear));
    return f * f * (3 - 2 * f);
  };
  const m = S.naveMould;
  const springIndex = Math.max(1, Math.round(-O.spring * (nSide - 1)));
  const ribs = Math.round(S.naveRibs);
  const ribAt: number[] = [];
  for (let r = 1; r <= ribs; r++) ribAt.push(springIndex + ((nSide - 1 - springIndex) * r) / (ribs + 1));

  // The end wall: where the floor meets it, under the window.
  // It is the last thing drawn: the sketch starts nearest you and ends here.
  const wall = t >= 1 ? 1 : Math.min(1, Math.max(0, (t - 0.88) / 0.12));
  pen = wall;
  line(X(1, -O.hw), Y(1, floor), X(1, O.hw), Y(1, floor));
  sketch(11, strength * 0.5 * wall * Math.min(1, 0.25 + (1 - Math.min(1, clear))), 0.9);

  for (let b = -1; b < 80; b++) {
    const id = b + base; // stays with the arch as it moves
    const s = scaleAt(b - shift);
    if (s > reach) break;
    const next = scaleAt(b + 1 - shift);
    if (next <= 1) continue;
    const behind = s < 1; // still behind the end wall: only its bay shows
    // The draw-in: bays are sketched one after another, starting nearest you
    // and working in toward the window.
    const order = 1 - Math.min(1, Math.max(0, Math.log(Math.max(1, s)) / Math.log(reach)));
    const shown = t >= 1 ? 1 : Math.min(1, Math.max(0, (t - order * 0.66) / 0.34));
    if (shown <= 0) continue;
    pen = shown;
    back = false;
    const a = lit(s) * fadeIn(s);
    const key = id * 197;
    const R = (n: number) => hash(id, n + Math.round(S.mSeed) * 1000); // this bay's own random numbers

    // The arch: a bundle of lines. With detail, more lines at uneven spacing.
    const rings: [number, number, number][] = [
      [1, 1, 1.05],
      [1 + m, 0.55, 0.8],
      [1 + m * 2.3, 0.85, 0.95],
      [1 + m * 3.1, 0.4, 0.7],
    ];
    const extra = Math.round(detail * 4 * S.mRings);
    for (let e = 0; e < extra; e++) rings.push([1 + m * (3.6 + e * 0.9 + R(60 + e) * 0.5), 0.3 + R(64 + e) * 0.45, 0.7]);
    const band = rings[rings.length - 1][0];
    if (!behind) {
      rings.forEach(([k, al, wd], ri) => {
        machine(ri >= 4);
        half(LEFT, s * k);
        sketch(key + ri * 2, a * al, wd, shown);
        half(RIGHT, s * k);
        sketch(key + ri * 2 + 1, a * al, wd, shown);
      });
      machine(false);
      // Its foot on the floor.
      line(X(s, -O.hw), Y(s, floor), X(s, O.hw), Y(s, floor));
      sketch(key + 29, a * 0.45 * shown, 0.8);
      if (detail > 0.3) {
        line(X(s * band, -O.hw), Y(s * band, floor), X(s * band, O.hw), Y(s * band, floor));
        sketch(key + 28, a * 0.35 * shown, 0.8);
      }
      // Ladders: rows of short ticks across the band, as in the original's roof.
      if (detail > 0 && S.mLadders > 0) {
        machine(true);
        for (const side of [LEFT, RIGHT]) {
          const sk = side === LEFT ? 0 : 500;
          for (let n = 0; n < 3; n++) {
            if (R(70 + n + sk) > detail * 0.9 * S.mLadders) continue;
            const from = springIndex + R(73 + n + sk) * (nSide - 1 - springIndex) * 0.8;
            const count = 4 + Math.floor(R(76 + n + sk) * 7);
            const k0 = rings[1 + Math.floor(R(79 + n + sk) * 2)][0];
            for (let c = 0; c < count; c++) {
              roof(side, from + c * 1.6, s * k0);
              roof(side, from + c * 1.6, s * band);
              sketch(key + 600 + sk + n * 20 + c, a * 0.55 * shown, 0.7);
            }
          }
        }
      }
    }

    machine(false);
    back = true; // everything from here runs along the bay
    const out = Math.max(1, s * band);
    if (next <= out) continue;
    const mid = (out + next) / 2;
    const fadeBay = lit(mid) * fadeIn(mid) * shown;
    if (fadeBay <= 0.004) continue;
    for (const side of [LEFT, RIGHT]) {
      const sideKey = side === LEFT ? 0 : 50;
      const sk = side === LEFT ? 0 : 500;
      const sgn = side === LEFT ? -1 : 1;
      // The vault ribs, running back along the roof.
      for (let r = 0; r < ribAt.length; r++) {
        roof(side, ribAt[r], out);
        roof(side, ribAt[r], next);
        sketch(key + 32 + sideKey + r, fadeBay * 0.5, 0.75);
      }
      // String courses along the wall.
      for (const [h, al] of [[O.spring, 0.6], [O.spring * 0.25, 0.3], [floor * 0.55, 0.3]] as const) {
        line(X(out, side[0]), Y(out, h), X(next, side[0]), Y(next, h));
        sketch(key + 40 + sideKey + Math.round(h * 100), fadeBay * al, 0.75);
      }
      // A side window in the bay, seen at an angle.
      if (S.naveSides && !behind) {
        const s0 = out + (next - out) * 0.2;
        const s1 = out + (next - out) * 0.8;
        const lo = -0.06;
        const hi = O.spring * 0.9;
        for (const inset of [0, 0.12]) {
          for (const part of [O.left, O.right]) {
            for (let i = 0; i < part.length; i += 2) {
              const u0 = (part[i] / O.hw + 1) / 2;
              const u = inset + u0 * (1 - inset * 2);
              const v = -part[i + 1] * (1 - inset * 0.6);
              const sc = s0 + (s1 - s0) * u;
              pts.push(X(sc, sgn * O.hw), Y(sc, lo + (hi - lo) * v));
            }
            sketch(key + 50 + sideKey + (inset ? 2 : 0) + (part === O.left ? 0 : 1), fadeBay * (inset ? 0.35 : 0.6), 0.75);
          }
        }
        const sm = (s0 + s1) / 2;
        line(X(sm, sgn * O.hw), Y(sm, lo), X(sm, sgn * O.hw), Y(sm, hi));
        sketch(key + 56 + sideKey, fadeBay * 0.35, 0.7);
        line(X(s0, sgn * O.hw), Y(s0, lo), X(s1, sgn * O.hw), Y(s1, lo));
        sketch(key + 57 + sideKey, fadeBay * 0.5, 0.75);
      }

      if (detail <= 0) continue;
      machine(true);
      const S0 = (v: number) => out + (next - out) * v; // across the bay, window side to near side
      // Slots in the roof, between the ribs: long rounded openings.
      const cells = [springIndex, ...ribAt, nSide - 1];
      for (let c = 0; c < cells.length - 1; c++) {
        if (R(100 + c + sk) > detail * 0.85 * S.mSlots) continue;
        const inset = Math.max(0.04, 0.5 - 0.32 * S.mSize);
        const i0 = cells[c] + (cells[c + 1] - cells[c]) * inset;
        const i1 = cells[c] + (cells[c + 1] - cells[c]) * (1 - inset);
        const v0 = 0.15 + R(110 + c + sk) * 0.25;
        const v1 = v0 + (0.25 + R(120 + c + sk) * 0.3) * S.mSize;
        shape((u, v) => roof(side, i0 + (i1 - i0) * u, S0(v)), 0, 1, v0, Math.min(0.92, v1), R(130 + c + sk) < 0.6 ? 0.5 : 0.18);
        sketch(key + 700 + sk + c, fadeBay * 0.6, 0.75);
        // A cross-tie from rib to rib.
        if (R(140 + c + sk) < detail * 0.5) {
          const sv = S0(0.1 + R(150 + c + sk) * 0.8);
          for (let q = 0; q <= 8; q++) roof(side, cells[c] + ((cells[c + 1] - cells[c]) * q) / 8, sv);
          sketch(key + 720 + sk + c, fadeBay * 0.4, 0.7);
        }
      }
      // On the wall (v runs up from the floor to the springing).
      const wallAt = (u: number, v: number) => pts.push(X(S0(u), sgn * O.hw), Y(S0(u), floor + (O.spring - floor) * v));
      // Pipes: lines running the length of the bay, in groups, with clamps.
      const groups = Math.round(detail * 3 * S.mPipes);
      for (let n = 0; n < groups; n++) {
        const v = 0.08 + R(200 + n + sk) * 0.84;
        const count = 2 + Math.floor(R(210 + n + sk) * 3);
        for (let c = 0; c < count; c++) {
          const vv = v + c * 0.016;
          for (let q = 0; q <= 6; q++) wallAt(q / 6, vv);
          sketch(key + 740 + sk + n * 10 + c, fadeBay * 0.5, 0.7);
        }
        const cu = 0.2 + R(220 + n + sk) * 0.6;
        shape(wallAt, cu, cu + 0.05, v - 0.012, v + count * 0.016 + 0.004, 0.2);
        sketch(key + 790 + sk + n, fadeBay * 0.6, 0.75);
      }
      // Panels: rounded boxes with a smaller one inside and a couple of studs.
      for (let n = 0; n < 2; n++) {
        if (R(240 + n + sk) > detail * 0.8 * S.mPanels) continue;
        const u0 = 0.12 + R(250 + n + sk) * 0.35;
        const u1 = u0 + (0.25 + R(260 + n + sk) * 0.25) * S.mSize;
        const v0 = S.naveSides ? 0.02 + n * 0.05 : 0.1 + R(270 + n + sk) * 0.5;
        const v1 = v0 + (S.naveSides ? 0.07 : 0.12 + R(280 + n + sk) * 0.2);
        shape(wallAt, u0, Math.min(0.94, u1), v0, v1, 0.16);
        sketch(key + 800 + sk + n, fadeBay * 0.65, 0.75);
        shape(wallAt, u0 + 0.04, Math.min(0.9, u1) - 0.04, v0 + (v1 - v0) * 0.25, v1 - (v1 - v0) * 0.25, 0.5);
        sketch(key + 810 + sk + n, fadeBay * 0.4, 0.7);
        for (let q = 0; q < 2; q++) {
          const su = q ? Math.min(0.94, u1) - 0.02 : u0 + 0.02;
          shape(wallAt, su - 0.008, su + 0.008, v1 + 0.012, v1 + 0.03, 0.5);
          sketch(key + 820 + sk + n * 2 + q, fadeBay * 0.55, 0.7);
        }
      }
      // A trace: a line along the wall that jogs up or down and ends in a stud.
      if (R(300 + sk) < detail * S.mTraces) {
        const v = 0.3 + R(310 + sk) * 0.6;
        const dv = (R(320 + sk) - 0.5) * 0.16;
        const ju = 0.3 + R(330 + sk) * 0.3;
        for (let q = 0; q <= 4; q++) wallAt((ju * q) / 4, v);
        wallAt(ju + 0.05, v + dv);
        for (let q = 1; q <= 3; q++) wallAt(ju + 0.05 + ((0.8 - ju - 0.05) * q) / 3, v + dv);
        sketch(key + 840 + sk, fadeBay * 0.55, 0.75);
        shape(wallAt, 0.8, 0.83, v + dv - 0.012, v + dv + 0.012, 0.5);
        sketch(key + 841 + sk, fadeBay * 0.6, 0.75);
      }
    }
    machine(false);
    // The ridge.
    roof(LEFT, nSide - 1, out);
    roof(LEFT, nSide - 1, next);
    sketch(key + 60, fadeBay * 0.6, 0.8);
    // The floor: boards running to the window, and a joint half way along the bay.
    for (let f = -3; f <= 3; f++) {
      const fx = (f / 4) * O.hw;
      line(X(Math.max(1, s), fx), Y(Math.max(1, s), floor), X(next, fx), Y(next, floor));
      sketch(key + 64 + f, fadeBay * (f === 0 ? 0.4 : 0.28), 0.7);
    }
    const midS = scaleAt(b + 0.5 - shift);
    if (midS > 1) {
      line(X(midS, -O.hw), Y(midS, floor), X(midS, O.hw), Y(midS, floor));
      sketch(key + 72, fadeBay * 0.2, 0.7);
    }
    // Plates set into the floor.
    if (detail > 0 && R(400) < detail * 0.8 * S.mPlates) {
      machine(true);
      const f0 = -0.7 + R(410) * 0.9;
      const f1 = f0 + 0.2 + R(420) * 0.3;
      shape((u, v) => pts.push(X(out + (next - out) * v, O.hw * (f0 + (f1 - f0) * u)), Y(out + (next - out) * v, floor)), 0, 1, 0.2, 0.75, 0.15);
      sketch(key + 860, fadeBay * 0.45, 0.7);
      machine(false);
    }
  }
  g.globalAlpha = 1;
}
