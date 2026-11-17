"use client";

import { useEffect, useRef } from "react";
import { opening, through } from "../cathedral/opening";
import type { Layers, Settings } from "./engine";

/**
 * The window, engraved: the same banknote engraving used on the etched
 * cathedral (see Etched.tsx), laid over the window. The stone, the symbol and
 * the glass each get a tone, and the engraving turns tone into parallel lines
 * whose width follows it, bending round the forms, with a second set crossing
 * them where it is darkest.
 *
 * It sits under the window's own drawn lines, which stay as they are. With
 * its strength at 0 nothing is drawn at all.
 */

export type WinEtchLook = {
  winEtch: number; // strength of the engraving on the window, 0 = off
  winEtchStone: number; // tone of the stone
  winEtchSymbol: number; // tone of the symbol
  winEtchGlass: number; // tone of the glass
  winEtchRound: number; // how much the stone is shaded toward its edges, so it reads as carved
  winEtchLines: number; // distance between engraved lines, in pixels
  winEtchWeight: number; // line weight
  winEtchAngle: number; // direction of the lines, in degrees
  winEtchBend: number; // contour flow: how much the lines bend round forms
  winEtchCross: number; // cross-hatching where it is darkest
  winEtchStipple: number; // fine dots between the lines
  winEtchWear: number; // small gaps in the ink
};

export const WIN_ETCH_LOOK: WinEtchLook = {
  winEtch: 0,
  winEtchStone: 0.55,
  winEtchSymbol: 0.85,
  winEtchGlass: 0.22,
  winEtchRound: 0.6,
  winEtchLines: 3.2,
  winEtchWeight: 1,
  winEtchAngle: -7,
  winEtchBend: 0.65,
  winEtchCross: 0.65,
  winEtchStipple: 0.3,
  winEtchWear: 0.12,
};

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D img;    // the window's tone: how dark each part is
uniform sampler2D field;  // the same, blurred: its local average
uniform vec2 res;         // canvas size in device pixels
uniform float px;         // device pixels per CSS pixel
uniform float lines, weight, bend, cross_, angle, stipple, wear, strength;
uniform vec3 ink;
out vec4 outColor;

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
  vec2 uv = q / res;
  float darkness = texture(img, uv).r;
  float mean = texture(field, uv).r;
  float e = 6.0 / res.x;
  float gx = texture(field, uv + vec2(e, 0.0)).r - texture(field, uv - vec2(e, 0.0)).r;
  // The pattern is measured in CSS pixels on the screen, so it stays as fine on any display.
  vec2 pt = (q - res * 0.5) / px;
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
  // Nothing at all where the window has no tone: outside it, or a part set to 0.
  float alpha = engraving * strength * smoothstep(0.0, 0.03, darkness);
  outColor = vec4(ink * alpha, alpha);
}`;

const rgbOf = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0.1, 0.1, 0.09];
};

// How dark each part of the window is, before engraving: a picture the size
// of the window's layers. Stone is darkest at its edges and eases toward its
// middle, so a mullion reads as carved; glass is lightest round the symbol.
function toneOf(L: Layers, S: Settings & WinEtchLook): HTMLCanvasElement {
  const { w, h, k, stone, symbol, inside } = L;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const px = img.data;
  const weight = S.weight * k;
  const line = Math.max(0.6, S.line * k);
  const round = 9 * k; // how far in from its edge the stone goes on getting lighter
  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    px[o + 3] = 255;
    let open = inside[i] + weight + 0.5;
    if (open <= 0) continue;
    if (open > 1) open = 1;
    const d = stone[i] + weight; // above 0: inside the stone
    const inStone = d <= 0 ? 0 : d >= 1 ? 1 : d;
    let dark: number;
    if (symbol && symbol[i] + weight > -line) dark = S.winEtchSymbol;
    else {
      const edge = d <= 0 ? 1 : Math.max(0, 1 - d / round);
      const carved = S.winEtchStone * (1 - S.winEtchRound * 0.6 * (1 - edge));
      const y = (i / w) | 0;
      const x = i - y * w;
      const far = Math.min(1, Math.hypot(x - L.cx, y - L.cy) / (h * 0.55));
      const glass = S.winEtchGlass * (0.55 + 0.45 * far);
      dark = glass + (carved - glass) * inStone;
    }
    const v = Math.max(0, Math.min(1, dark)) * open * 255;
    px[o] = px[o + 1] = px[o + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export default function WindowEtch({ layers, look, ink, className, style }: { layers: Layers | null; look: Settings & WinEtchLook; ink: string; className?: string; style?: React.CSSProperties }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Settings are read from here on every frame, so changing one only redraws.
  const live = useRef({ look, ink, stamp: 0 });
  live.current = { look, ink, stamp: live.current.stamp + 1 };
  // The tone picture is made again only when something that shapes it changes.
  const tone = useRef<{ pic: HTMLCanvasElement; fresh: boolean } | null>(null);
  useEffect(() => {
    if (!layers) return;
    tone.current = { pic: toneOf(layers, look), fresh: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, look.weight, look.line, look.winEtchStone, look.winEtchSymbol, look.winEtchGlass, look.winEtchRound]);
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
    const textures = [gl.createTexture(), gl.createTexture()];
    const upload = (unit: number, source: TexImageSource) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    let ready = false;
    let raf = 0;
    let last = "";
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = tone.current;
      if (t?.fresh) {
        t.fresh = false;
        upload(0, t.pic);
        // The local average: the tone drawn very small, then read back smoothly.
        const small = document.createElement("canvas");
        small.width = Math.max(8, Math.round(t.pic.width / 12));
        small.height = Math.max(8, Math.round(t.pic.height / 12));
        const g = small.getContext("2d")!;
        g.imageSmoothingQuality = "high";
        g.drawImage(t.pic, 0, 0, small.width, small.height);
        upload(1, small);
        ready = true;
        last = "";
      }
      if (!ready) return;
      const { look, ink, stamp } = live.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(c.clientWidth * dpr);
      const H = Math.round(c.clientHeight * dpr);
      if (W < 2 || H < 2) return;
      // In the opening it comes up with the glass, after the lines are drawn.
      const shown = opening.on ? through("glass") : 1;
      const key = `${W}:${H}:${stamp}:${shown.toFixed(3)}`;
      if (key === last) return;
      last = key;
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1i(U("img"), 0);
      gl.uniform1i(U("field"), 1);
      gl.uniform2f(U("res"), W, H);
      gl.uniform1f(U("px"), dpr);
      gl.uniform1f(U("lines"), Math.max(0.8, look.winEtchLines));
      gl.uniform1f(U("weight"), look.winEtchWeight);
      gl.uniform1f(U("bend"), look.winEtchBend);
      gl.uniform1f(U("cross_"), look.winEtchCross);
      gl.uniform1f(U("angle"), (look.winEtchAngle * Math.PI) / 180);
      gl.uniform1f(U("stipple"), look.winEtchStipple);
      gl.uniform1f(U("wear"), look.winEtchWear);
      gl.uniform3f(U("ink"), ...rgbOf(ink));
      gl.uniform1f(U("strength"), Math.min(1, look.winEtch) * shown);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvas} className={className} style={style} aria-hidden />;
}
