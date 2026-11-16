"use client";

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
  etchClear: number; // size of the clear room round the window, 1 = the board in the render
};

export const ETCH_LOOK: EtchLook = {
  naveView: "drawn",
  etchSize: 1.5,
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
};

// Where the board sits in the render, as shares of its width and height.
const BOARD = { cx: 0.4995, cy: 0.4954, hw: 0.092, hh: 0.305 };
const ASPECT = 2048 / 1148;

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D img;    // the picture
uniform sampler2D field;  // the picture, blurred: its local average
uniform vec2 res;      // canvas size in device pixels
uniform vec2 centre;   // where the board's centre sits, in device pixels from the top left
uniform float tall;    // picture height in device pixels
uniform float px;      // device pixels per CSS pixel
uniform float lines, weight, bend, cross_, detail, exposure, contrast, angle, stipple, wear, inkLight, clear;
uniform vec3 ink;
uniform float strength;
out vec4 outColor;

const float ASPECT = ${ASPECT.toFixed(5)};
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
void main() {
  vec2 q = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 uv = MID + (q - centre) / vec2(tall * ASPECT, tall);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { outColor = vec4(0.0); return; }
  float original = texture(img, uv).r;
  float mean = texture(field, uv).r;
  if (inkLight > 0.5) { original = 1.0 - original; mean = 1.0 - mean; }
  float detailed = clamp(original + (original - mean) * detail, 0.0, 1.0);
  float lum = pow(clamp(detailed * exp2(exposure), 0.0, 1.0), 0.85);
  lum = clamp((lum - 0.5) * contrast + 0.5, 0.0, 1.0);
  float darkness = clamp(1.0 - lum, 0.0, 1.0);
  vec2 e = vec2(2.0 / (1000.0 * ASPECT), 2.0 / 1000.0);
  float gx = texture(field, uv + vec2(e.x, 0.0)).r - texture(field, uv - vec2(e.x, 0.0)).r;
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
  // Fade at the very edge of the picture.
  vec2 m = min(uv, 1.0 - uv);
  float fade = smoothstep(0.0, 0.1, min(m.x, m.y));
  float alpha = engraving * room * fade * strength;
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
    image.src = "/cathedral/church-tone.jpg";

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
      const key = `${W}:${H}:${stamp}`;
      if (key === last) return;
      last = key;
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const tallWin = size * H;
      const open = outline.ratio * tallWin;
      const cx = W / 2 + outline.dx * tallWin;
      const cy = top * H + outline.sill * tallWin - open / 2;
      c.style.transformOrigin = `${(cx / W) * 100}% ${(cy / H) * 100}%`;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1i(U("img"), 0);
      gl.uniform2f(U("res"), W, H);
      gl.uniform2f(U("centre"), cx, cy);
      gl.uniform1f(U("tall"), look.etchSize * H);
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
