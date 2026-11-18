"use client";

import { opening, through } from "../cathedral/opening";
import { useEffect, useRef } from "react";
import { Outline } from "./nave";

/**
 * The second cathedral: the original "Church" render, redrawn as an engraving.
 *
 * The treatment is a port of the "Banknote Engraving" shader Neesh sent on
 * 2026-11-16 (a Figma shader), kept to its engraving parts: parallel lines
 * whose width follows the picture's tone, bent by the picture so they flow
 * round forms, a second set crossing them in the shadows, fine stippling and
 * ink wear. Its paper, guilloche and hue-accent parts are left out: here the
 * engraving is only ink, laid over the page.
 *
 * The circuit board in the middle of the render is left out, so the window
 * has clear room.
 */

export type EtchLook = {
  naveView: "drawn" | "etched"; // which cathedral: the drawn one, or this one
  etchSize: number; // height of the picture, in screen heights
  etchY: number; // vertical position: how far the picture's middle sits below the window's, in screen heights
  etchX: number; // horizontal position, in screen widths
  etchEye: number; // eye level: 0.5 as the picture is; higher shows more floor, lower more roof
  etchLines: number; // distance between engraved lines, in pixels
  etchWeight: number; // line weight
  etchBend: number; // contour flow: how much the lines bend round forms
  etchCross: number; // cross-hatching in the shadows
  etchDetail: number; // architectural detail: sharpens local light and dark
  etchExposure: number; // lighter or darker picture before engraving
  etchContrast: number;
  etchAngle: number; // direction of the lines, in degrees
  etchStipple: number; // fine dots between the lines
  etchWear: number; // small gaps in the ink
  etchInk: "dark" | "light"; // ink follows the picture's shadows, or its lights
  etchClear: number; // width of the clear room round the window, 1 = a little wider than the window
  etchClearTall: number; // height of the clear room, 1 = a little taller than the window
  etchClearSoft: number; // how gradually the engraving returns past the clear room
};

export const ETCH_LOOK: EtchLook = {
  naveView: "drawn",
  etchSize: 0.7,
  etchY: 0,
  etchX: 0,
  etchEye: 0.5,
  etchLines: 3.2,
  etchWeight: 1,
  etchBend: 0.65,
  etchCross: 0.65,
  etchDetail: 0.7,
  etchExposure: 0.35,
  etchContrast: 1.08,
  etchAngle: -7,
  etchStipple: 0.3,
  etchWear: 0.12,
  etchInk: "light",
  etchClear: 1,
  etchClearTall: 1,
  etchClearSoft: 0.45,
};

// Where the board sits in the render, as shares of its width and height.
const BOARD = { cx: 0.5, cy: 0.5025, hw: 0.052, hh: 0.158 };
const ASPECT = 2960 / 1648;
// The picture is a tunnel of frames, one inside the next. Past its edges the
// same frames are carried on outward, each ring this many times larger.
const GROW = 2;

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D img;    // the picture
uniform sampler2D field;  // the picture, blurred: its local average
uniform vec2 res;      // canvas size in device pixels
uniform vec2 centre;   // where the board's centre sits, in device pixels from the top left
uniform vec4 win;      // the clear room round the window: centre and half size, in device pixels
uniform float rise;    // how far its pointed top stands above where its sides start to curve
uniform float soft;    // width of its soft edge, in device pixels
uniform float tall;    // picture height in device pixels
uniform float eye;     // how much the floor is stretched and the roof squeezed, 1 = as the picture is
uniform float px;      // device pixels per CSS pixel
uniform float lines, weight, bend, cross_, detail, exposure, contrast, angle, stipple, wear, inkLight, clear;
uniform vec3 ink;
uniform float strength;
uniform float draw;     // how much of the picture has been sketched in, 0 to 1
out vec4 outColor;

const float ASPECT = ${ASPECT.toFixed(5)};
const float GROW = ${GROW.toFixed(1)};
const vec2 MID = vec2(${BOARD.cx.toFixed(4)}, ${BOARD.cy.toFixed(4)});

float hash(vec2 p) {
  vec3 q = fract(vec3(p.x, p.y, p.x) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
// One family of lines: how much of this pixel a line of the given width covers.
float lineCoverage(float phase, float amount) {
  float coverage = clamp(amount, 0.0, 1.0);
  float aa = max(fwidth(phase) * 0.65, 0.0001);
  float d = abs(fract(phase + 0.5) - 0.5);
  float resolved = 1.0 - smoothstep(coverage * 0.5 - aa, coverage * 0.5 + aa, d);
  return mix(resolved, coverage, smoothstep(0.45, 1.25, fwidth(phase)));
}
// The picture, carried on past its own edges. Outside the picture the same
// view is read again, larger, about its middle: the next ring of frames. Each
// ring is blended into the one before it over a narrow band.
float pic(sampler2D s, vec2 uv) {
  vec2 d = uv - 0.5;
  float m = max(abs(d.x), abs(d.y)) * 2.0;
  if (m <= 0.88) return texture(s, uv).r;
  float n = clamp(ceil(log(m) / log(GROW) - 0.0001), 0.0, 3.0);
  float k = pow(GROW, n);
  float a = texture(s, 0.5 + d / k).r;
  float b = texture(s, 0.5 + d / (k * GROW)).r;
  return mix(a, b, smoothstep(0.88, 1.0, m / k));
}
void main() {
  vec2 q = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  // Eye level: below the picture's horizon the floor is given more room, above it the roof less (or the reverse).
  vec2 off = q - centre;
  off.y /= off.y > 0.0 ? eye : 1.0 / eye;
  vec2 uv = MID + off / vec2(tall * ASPECT, tall);
  float original = pic(img, uv);
  float mean = pic(field, uv);
  if (inkLight > 0.5) { original = 1.0 - original; mean = 1.0 - mean; }
  float detailed = clamp(original + (original - mean) * detail, 0.0, 1.0);
  float lum = pow(clamp(detailed * exp2(exposure), 0.0, 1.0), 0.85);
  lum = clamp((lum - 0.5) * contrast + 0.5, 0.0, 1.0);
  float darkness = clamp(1.0 - lum, 0.0, 1.0);
  vec2 e = vec2(2.0 / (1000.0 * ASPECT), 2.0 / 1000.0);
  float gx = pic(field, uv + vec2(e.x, 0.0)) - pic(field, uv - vec2(e.x, 0.0));
  // The pattern is measured in CSS pixels on the screen, so it stays as fine on any display.
  vec2 pt = (q - centre) / px;
  float c = cos(angle), sn = sin(angle);
  vec2 point = vec2(pt.x * c - pt.y * sn, pt.x * sn + pt.y * c);
  float flowing = bend * (26.0 * mean + 4.0 * sin(point.x * 0.022) + 1.8 * sin(point.x * 0.054 + point.y * 0.017));
  float phase = (point.y + flowing + bend * gx * 22.0) / lines;
  float crossPhase = (point.x * 0.88 + point.y * 0.47 - flowing * 0.4) / lines;
  float crossAmount = cross_ * smoothstep(0.12, 0.8, darkness);
  float primary = 1.0 - pow(max(0.00001, 1.0 - darkness), 1.0 - crossAmount * 0.55);
  float secondary = 1.0 - pow(max(0.00001, 1.0 - darkness), crossAmount * 0.55);
  float a = lineCoverage(phase, primary * weight);
  float d = lineCoverage(crossPhase, secondary * weight);
  float engraving = 1.0 - (1.0 - a) * (1.0 - d);
  float noise = hash(floor(pt * 1.7));
  float fine = hash(floor(pt * 3.9) + 17.0);
  engraving = clamp(engraving + smoothstep(0.84, 1.0, fine) * darkness * (1.0 - engraving) * stipple, 0.0, 1.0);
  engraving *= 1.0 - wear * smoothstep(0.82, 1.0, noise) * 0.42;
  // Leave the board out, with a soft edge.
  vec2 b = abs(uv - MID) / (vec2(${BOARD.hw.toFixed(4)}, ${BOARD.hh.toFixed(4)}) * clear);
  float room = smoothstep(0.88, 1.3, max(b.x, b.y));
  // And leave the window itself clear, where it stands above the board. The
  // clear room is the window's own shape, a pointed arch, so the engraving
  // comes equally close all the way round.
  vec2 w = vec2(abs(q.x - win.x), q.y - win.y);
  float springY = rise - win.w;
  float radius = (rise * rise + win.z * win.z) / (2.0 * win.z);
  vec2 v = w - win.zw;
  float away = w.y > springY
    ? length(max(v, 0.0)) + min(max(v.x, v.y), 0.0)
    : length(w - vec2(win.z - radius, springY)) - radius;
  room = min(room, smoothstep(0.0, max(soft, 1.0), away));
  // The rings stop after three; fade out before the last one ends.
  vec2 far = abs(uv - 0.5) * 2.0;
  float fade = 1.0 - smoothstep(GROW * GROW * GROW * 0.8, GROW * GROW * GROW, max(far.x, far.y));
  // The sketch-in: the picture is drawn from the edges of the screen, nearest
  // you, in toward the window. Each engraved line reaches in by its own amount.
  float reach = pow(clamp(length(q - win.xy) / (0.5 * length(res)), 0.0, 1.0), 0.6);
  float edge = 1.15 - draw * 1.45;
  float sketched = smoothstep(edge, edge + 0.03, reach + (hash(vec2(floor(phase), 7.0)) - 0.5) * 0.25);
  float alpha = engraving * room * fade * strength * sketched;
  outColor = vec4(ink * alpha, alpha);
}`;

const rgbOf = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0.1, 0.1, 0.09];
};

export default function Etched({ outline, look, ink, strength, top, size, scroll = 0, play = 0 }: { outline: Outline | null; look: EtchLook; ink: string; strength: number; top: number; size: number; scroll?: number; play?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Settings are read from here on every frame, so changing one only redraws:
  // the drawing surface is set up once and kept.
  const live = useRef({ outline, look, ink, strength, top, size, scroll, stamp: 0 });
  live.current = { outline, look, ink, strength, top, size, scroll, stamp: live.current.stamp + 1 };
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
    const at = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const U = (name: string) => gl.getUniformLocation(prog, name);
    const upload = (unit: number, source: TexImageSource) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    let ready = false;
    let off = false;
    const image = new Image();
    image.onload = () => {
      if (off) return;
      upload(0, image);
      // The local average: the picture drawn very small, then read back smoothly.
      const small = document.createElement("canvas");
      small.width = 256;
      small.height = Math.round(256 / ASPECT);
      const g = small.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      g.drawImage(image, 0, 0, small.width, small.height);
      upload(1, small);
      ready = true;
      last = "";
    };
    image.src = "/cathedral/church-wide-tone.jpg";

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = "";
    // The engraving is cut once and only cut again when the screen changes
    // size. Walking in on scroll is a plain zoom of the finished picture.
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { outline, look, ink, strength, top, size, scroll, stamp } = live.current;
      if (!outline) return;
      const zoom = 1 + (still ? 0 : Math.min(1.2, window.scrollY / window.innerHeight) * scroll * 0.08);
      c.style.transform = `scale(${zoom.toFixed(4)})`;
      if (!ready) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(window.innerWidth * dpr);
      const H = Math.round(window.innerHeight * dpr);
      const drawn = opening.on ? through("cathedral") : 1;
      const key = `${W}:${H}:${stamp}:${drawn.toFixed(4)}`;
      if (key === last) return;
      last = key;
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const tallWin = size * H;
      const open = outline.ratio * tallWin;
      const wx = W / 2 + outline.dx * tallWin; // the window's centre
      const cx = wx + look.etchX * W;
      const wy = top * H + outline.sill * tallWin - open / 2; // the window's centre
      const cy = wy + look.etchY * H;
      c.style.transformOrigin = `${(cx / W) * 100}% ${(cy / H) * 100}%`;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1i(U("img"), 0);
      gl.uniform2f(U("res"), W, H);
      gl.uniform2f(U("centre"), cx, cy);
      const roomW = outline.hw * outline.ratio * tallWin * 1.15 * look.etchClear;
      const roomH = open * 0.56 * (look.etchClearTall ?? 1);
      const curve = outline.spring < -0.2 && outline.spring > -0.98 ? 1 + outline.spring : 0.45;
      gl.uniform4f(U("win"), wx, wy, roomW, roomH);
      gl.uniform1f(U("rise"), Math.min(roomH * 2, Math.max(roomW, curve * roomH * 2)));
      // On a phone the window takes up most of the screen's width, so the soft
      // edge is kept to half the space left beside the clear room: the
      // engraving is back to full strength before the edge of the screen.
      const softSet = (look.etchClearSoft ?? 0.45) * roomW;
      const soft = window.innerWidth <= 720 ? Math.min(softSet, Math.max(roomW * 0.15, (W / 2 - roomW) * 0.5)) : softSet;
      gl.uniform1f(U("soft"), soft);
      gl.uniform1f(U("tall"), look.etchSize * H);
      gl.uniform1f(U("eye"), Math.pow(2, (look.etchEye - 0.5) * 3));
      gl.uniform1f(U("px"), dpr);
      gl.uniform1i(U("field"), 1);
      gl.uniform1f(U("lines"), Math.max(0.8, look.etchLines));
      gl.uniform1f(U("weight"), look.etchWeight);
      gl.uniform1f(U("bend"), look.etchBend);
      gl.uniform1f(U("cross_"), look.etchCross);
      gl.uniform1f(U("detail"), look.etchDetail);
      gl.uniform1f(U("exposure"), look.etchExposure);
      gl.uniform1f(U("contrast"), look.etchContrast);
      gl.uniform1f(U("angle"), (look.etchAngle * Math.PI) / 180);
      gl.uniform1f(U("stipple"), look.etchStipple);
      gl.uniform1f(U("wear"), look.etchWear);
      gl.uniform1f(U("inkLight"), look.etchInk === "light" ? 1 : 0);
      gl.uniform1f(U("clear"), look.etchClear);
      gl.uniform3f(U("ink"), ...rgbOf(ink));
      gl.uniform1f(U("draw"), drawn);
      gl.uniform1f(U("strength"), Math.min(1, strength * 1.5));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      off = true;
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div className="nave-rise" data-play={play}>
      <canvas ref={canvas} className="nave etched" />
    </div>
  );
}
