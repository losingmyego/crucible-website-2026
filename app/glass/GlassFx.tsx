"use client";

import { useEffect, useRef } from "react";
import { opening, through } from "../cathedral/opening";
import type { Layers, Settings } from "./engine";

/**
 * Light effects on the window's glass (2026-11-17). Five of them, each with
 * its own strength, and each off at 0:
 *
 *   caustics        rippling coloured light cast on the floor below the window
 *   light bloom     the panes glow out past the lines that hold them
 *   sweeping sheen  a slow diagonal glint crossing the glass now and then
 *   chromatic edge  a faint prism split, red to blue, along the pane edges
 *   sparkle         glints in the glass, brighter near the pointer and on scroll
 *
 * One full-screen drawing surface holds all five. It only adds light. With
 * every strength at 0 it is not on the page at all.
 */

export type FxLook = {
  fxCaustics: number;
  fxCausticSize: number; // size of the ripples
  fxCausticSpeed: number;
  fxCausticReach: number; // how far down the floor they reach, in window heights
  fxCausticColor: number; // 0 plain light, 1 fully split into colour
  fxBloom: number;
  fxBloomSpread: number; // how far past the panes the glow reaches
  fxBloomPulse: number; // how much it breathes
  fxSheen: number;
  fxSheenWidth: number;
  fxSheenEvery: number; // seconds between one glint and the next
  fxSheenAngle: number; // degrees
  fxChroma: number;
  fxChromaSplit: number; // how far the colours part, in pixels
  fxSparkle: number;
  fxSparkleCount: number;
  fxSparkleSize: number;
};

export const FX_LOOK: FxLook = {
  fxCaustics: 0,
  fxCausticSize: 1,
  fxCausticSpeed: 1,
  fxCausticReach: 0.7,
  fxCausticColor: 0.6,
  fxBloom: 0,
  fxBloomSpread: 0.5,
  fxBloomPulse: 0.3,
  fxSheen: 0,
  fxSheenWidth: 0.25,
  fxSheenEvery: 7,
  fxSheenAngle: 25,
  fxChroma: 0,
  fxChromaSplit: 3,
  fxSparkle: 0,
  fxSparkleCount: 0.5,
  fxSparkleSize: 1,
};

export const fxOn = (l: Partial<FxLook>) => (l.fxCaustics || 0) > 0 || (l.fxBloom || 0) > 0 || (l.fxSheen || 0) > 0 || (l.fxChroma || 0) > 0 || (l.fxSparkle || 0) > 0;

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D mask;   // r: glass, g: nearness to a pane edge
uniform sampler2D glowA;  // the glass, a little blurred
uniform sampler2D glowB;  // the glass, very blurred
uniform vec2 res;         // canvas size in device pixels
uniform vec4 rect;        // the window drawing on screen: left, top, width, height, in device pixels
uniform vec4 open;        // the opening inside that drawing: left, top, right, bottom, as shares of it
uniform float px;         // device pixels per CSS pixel
uniform float time;
uniform vec2 pointer;     // in device pixels; far away when there is none
uniform float stir;       // how much the page is being scrolled just now, 0 to 1
uniform vec3 light;
uniform float solid;      // 0 on a dark page (light is added), above 0 on a light page (light is laid on)
uniform float shown;
uniform float caustics, cSize, cSpeed, cReach, cColor;
uniform float bloom, bSpread, bPulse;
uniform float sheen, sWidth, sEvery, sAngle;
uniform float chroma, cSplit;
uniform float sparkle, kCount, kSize;
out vec4 outColor;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.x, p.y, p.x) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec4 at(sampler2D s, vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(s, uv);
}
// Light through moving water: bright wandering threads.
float water(vec2 p, float t) {
  const float TAU = 6.28318530718;
  p = p * TAU - 250.0;
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
void main() {
  vec2 q = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 uv = (q - rect.xy) / rect.zw;
  vec4 m = at(mask, uv);
  float glass = m.r;
  vec3 col = vec3(0.0);
  float shade = 0.0;

  // Light bloom: the glass, blurred, so it reaches past the panes.
  if (bloom > 0.0) {
    float g = mix(at(glowA, uv).r, at(glowB, uv).r, bSpread);
    float breathe = 1.0 - bPulse * 0.5 * (0.5 + 0.5 * sin(time * 0.6));
    col += light * g * bloom * 0.55 * breathe;
  }

  // Sweeping sheen: one soft band crossing the glass, then a wait.
  if (sheen > 0.0 && glass > 0.0) {
    float a = radians(sAngle);
    vec2 w = (uv - vec2((open.x + open.z) * 0.5, (open.y + open.w) * 0.5)) * vec2(rect.z / rect.w, 1.0);
    float along = w.x * cos(a) + w.y * sin(a);
    float cycle = fract(time / max(1.0, sEvery));
    float span = min(1.0, 3.2 / max(1.0, sEvery)); // the crossing takes about three seconds
    float pos = mix(-0.9, 0.9, cycle / span);
    float band = cycle < span ? exp(-pow((along - pos) / max(0.02, sWidth * 0.35), 2.0)) : 0.0;
    col += light * band * glass * sheen * 0.6;
  }

  // Chromatic edge: the pane edges read three times, a little apart, one for each colour.
  if (chroma > 0.0) {
    vec2 o = vec2(cSplit * px, cSplit * px * 0.35) / rect.zw;
    float r = at(mask, uv + o).g;
    float g = m.g;
    float b = at(mask, uv - o).g;
    vec3 split = vec3(r, g, b);
    // What all three share is plain light; only the difference is colour.
    float shared = min(r, min(g, b));
    col += (split - shared * mix(0.85, 1.0, step(0.001, solid))) * chroma * 0.9;
  }

  // Sparkle: small glints at fixed places in the glass, each twinkling at its
  // own pace. They wake near the pointer and when the page is scrolled.
  if (sparkle > 0.0) {
    float cell = mix(46.0, 14.0, kCount) * px;
    vec2 gq = q - rect.xy;
    vec2 id = floor(gq / cell);
    float sum = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = id + vec2(float(i), float(j));
      vec2 spot = (c + 0.15 + 0.7 * vec2(hash(c), hash(c + 31.7))) * cell;
      float there = at(mask, spot / rect.zw).r;
      if (there < 0.5) continue;
      float pace = 0.35 + hash(c + 7.3) * 0.9;
      float tw = pow(max(0.0, sin(time * pace + hash(c + 2.1) * 6.2831)), 14.0);
      float near = exp(-pow(length(spot + rect.xy - pointer) / (150.0 * px), 2.0));
      float wake = clamp(0.22 + near * 1.6 + stir * 1.2, 0.0, 1.8);
      vec2 d = (gq - spot) / (px * kSize);
      float core = exp(-dot(d, d) / 2.2);
      float arms = exp(-abs(d.x) * 1.6) * exp(-abs(d.y) / 7.0) + exp(-abs(d.y) * 1.6) * exp(-abs(d.x) / 7.0);
      sum += (core + arms * 0.6) * tw * wake;
    }
    col += light * sum * sparkle;
  }

  // Caustics: on the floor below the sill, widening as it comes toward you.
  if (caustics > 0.0) {
    float sill = rect.y + open.w * rect.w;
    float cx = rect.x + (open.x + open.z) * 0.5 * rect.z;
    float hw = (open.z - open.x) * 0.5 * rect.z;
    float tall = (open.w - open.y) * rect.w;
    float down = (q.y - sill) / max(1.0, tall * cReach);
    if (down > 0.0 && down < 1.0) {
      float wide = hw * (1.0 + down * 1.6);
      float side = abs(q.x - cx) / wide;
      float shape = smoothstep(0.0, 0.08, down) * pow(1.0 - down, 1.3) * (1.0 - smoothstep(0.55, 1.0, side));
      if (shape > 0.001) {
        // The floor runs away from you, so the ripples are squeezed near the sill.
        vec2 f = vec2((q.x - cx) / (hw * (1.0 + down * 1.6)), pow(down, 0.7) * 1.6) * (2.2 / cSize);
        float t = time * 0.45 * cSpeed;
        float w0 = water(f, t);
        vec3 c = vec3(w0);
        if (cColor > 0.0) {
          float s = 0.035 * cColor;
          c = vec3(water(f + vec2(s, 0.0), t), w0, water(f - vec2(s, s * 0.6), t));
          // A slow drift of warm and cool across the patch.
          vec3 hue = 0.5 + 0.5 * cos(6.2831 * (f.x * 0.11 + f.y * 0.07 + time * 0.02 + vec3(0.0, 0.33, 0.67)));
          c *= mix(vec3(1.0), 0.55 + hue * 0.9, cColor);
        }
        col += light * c * shape * caustics * 0.9;
        // On a light page light cannot be brighter than the paper, so the
        // patch is shaded a little and the bright threads are paper showing through.
        shade += shape * caustics * 0.3 * (1.0 - clamp(w0, 0.0, 1.0));
      }
    }
  }

  col *= shown;
  // Dark page: the light is laid on with its own brightness as its cover.
  // (Colour with no cover at all is not drawn by every graphics card.)
  if (solid <= 0.0) { col = min(col, vec3(1.0)); outColor = vec4(col, max(col.r, max(col.g, col.b))); return; }
  // Light page: the light is laid on in its own colour, over the shade.
  col = min(col * 1.6, vec3(1.0));
  float a = max(col.r, max(col.g, col.b));
  float sh = clamp(shade * shown, 0.0, 0.6) * (1.0 - a);
  outColor = vec4(col + vec3(0.2, 0.17, 0.14) * sh, a + sh);
}`;

const rgbOf = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec((hex || "").trim());
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1];
};

// Where the glass is and where its edges are, as a picture hw the size of the window's layers.
function maskOf(L: Layers, S: Settings): HTMLCanvasElement {
  const step = 2;
  const w = Math.ceil(L.w / step);
  const h = Math.ceil(L.h / step);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const px = img.data;
  const weight = S.weight * L.k;
  const band = 2.2 * L.k;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = Math.min(L.h - 1, y * step) * L.w + Math.min(L.w - 1, x * step);
      const o = (y * w + x) * 4;
      px[o + 3] = 255;
      let open = L.inside[i] + weight + 0.5;
      if (open <= 0) continue;
      if (open > 1) open = 1;
      const d = L.stone[i] + weight; // above 0: inside the stone
      const glass = d >= 0.5 ? 0 : d <= -0.5 ? 1 : 0.5 - d;
      px[o] = glass * open * 255;
      px[o + 1] = Math.exp(-Math.pow(d / band, 2)) * open * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
// A picture drawn very small reads back as a blur.
function smaller(src: HTMLCanvasElement, by: number): HTMLCanvasElement {
  let now = src;
  let left = by;
  while (left > 1) {
    const f = Math.min(2, left);
    const c = document.createElement("canvas");
    c.width = Math.max(4, Math.round(now.width / f));
    c.height = Math.max(4, Math.round(now.height / f));
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(now, 0, 0, c.width, c.height);
    now = c;
    left /= f;
  }
  return now;
}

export default function GlassFx({ layers, look, light, dark }: { layers: Layers | null; look: Settings & FxLook; light?: string; dark: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ look, light, dark, layers });
  live.current = { look, light, dark, layers };
  const pics = useRef<{ mask: HTMLCanvasElement; a: HTMLCanvasElement; b: HTMLCanvasElement; fresh: boolean } | null>(null);
  useEffect(() => {
    if (!layers) return;
    const mask = maskOf(layers, look);
    pics.current = { mask, a: smaller(mask, 6), b: smaller(mask, 20), fresh: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, look.weight]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const gl = c.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
    if (!gl) return;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (name: string) => gl.getUniformLocation(prog, name);
    const textures = [gl.createTexture(), gl.createTexture(), gl.createTexture()];
    const upload = (unit: number, source: TexImageSource) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ready = false;
    let raf = 0;
    let drawn = false;
    const point = { x: -1e6, y: -1e6 };
    const move = (e: PointerEvent) => {
      point.x = e.clientX;
      point.y = e.clientY;
    };
    window.addEventListener("pointermove", move, { passive: true });
    let lastY = window.scrollY;
    let stir = 0;
    const began = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const p = pics.current;
      if (p?.fresh) {
        p.fresh = false;
        upload(0, p.mask);
        upload(1, p.a);
        upload(2, p.b);
        ready = true;
        drawn = false;
      }
      const { look, light, dark, layers } = live.current;
      if (!ready || !layers || document.hidden) return;
      if (still && drawn) return;
      // The window drawing on the page: the last window canvas beside this one.
      const wins = c.parentElement?.querySelectorAll<HTMLCanvasElement>("canvas.win-canvas");
      const win = wins && wins[wins.length - 1];
      if (!win) return;
      const box = win.getBoundingClientRect();
      const mine = c.getBoundingClientRect();
      if (box.width < 2 || mine.width < 2) return;
      // Soft light does not need every pixel of a sharp screen.
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const W = Math.round(mine.width * dpr);
      const H = Math.round(mine.height * dpr);
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const moved = Math.abs(window.scrollY - lastY);
      lastY = window.scrollY;
      stir = Math.max(stir * 0.94, Math.min(1, moved / 40));
      drawn = true;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1i(U("mask"), 0);
      gl.uniform1i(U("glowA"), 1);
      gl.uniform1i(U("glowB"), 2);
      gl.uniform2f(U("res"), W, H);
      gl.uniform4f(U("rect"), (box.left - mine.left) * dpr, (box.top - mine.top) * dpr, box.width * dpr, box.height * dpr);
      gl.uniform4f(U("open"), layers.pad / layers.w, layers.pad / layers.h, 1 - layers.pad / layers.w, layers.bottom / layers.h);
      gl.uniform1f(U("px"), dpr);
      gl.uniform1f(U("time"), still ? 0 : (now - began) / 1000);
      gl.uniform2f(U("pointer"), (point.x - mine.left) * dpr, (point.y - mine.top) * dpr);
      gl.uniform1f(U("stir"), still ? 0 : stir);
      gl.uniform3f(U("light"), ...rgbOf(light || "#ffffff"));
      gl.uniform1f(U("solid"), dark ? 0 : 0.9);
      // In the opening the effects come up with the glass.
      gl.uniform1f(U("shown"), opening.on ? through("glass") : 1);
      gl.uniform1f(U("caustics"), look.fxCaustics);
      gl.uniform1f(U("cSize"), Math.max(0.2, look.fxCausticSize));
      gl.uniform1f(U("cSpeed"), look.fxCausticSpeed);
      gl.uniform1f(U("cReach"), Math.max(0.05, look.fxCausticReach));
      gl.uniform1f(U("cColor"), look.fxCausticColor);
      gl.uniform1f(U("bloom"), look.fxBloom);
      gl.uniform1f(U("bSpread"), look.fxBloomSpread);
      gl.uniform1f(U("bPulse"), look.fxBloomPulse);
      gl.uniform1f(U("sheen"), look.fxSheen);
      gl.uniform1f(U("sWidth"), look.fxSheenWidth);
      gl.uniform1f(U("sEvery"), look.fxSheenEvery);
      gl.uniform1f(U("sAngle"), look.fxSheenAngle);
      gl.uniform1f(U("chroma"), look.fxChroma);
      gl.uniform1f(U("cSplit"), look.fxChromaSplit);
      gl.uniform1f(U("sparkle"), look.fxSparkle);
      gl.uniform1f(U("kCount"), look.fxSparkleCount);
      gl.uniform1f(U("kSize"), Math.max(0.3, look.fxSparkleSize));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
    };
  }, []);
  return <canvas ref={canvas} className="glass-fx" aria-hidden />;
}
