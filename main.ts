// News frame for Thursday 19 November 2026: draws the day's world news as one 1024x1024 PNG.
// Node 22, standard library only, no network, deterministic (same bytes on every run).
// Everything is drawn here: an anti-aliased capsule/polygon rasterizer, a hand-made stroke font, a PNG encoder.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const img = new Float32Array(W * H * 3);
const mask = new Float32Array(W * H);
let mx0 = W, my0 = H, mx1 = -1, my1 = -1;

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function put(i, col, a) {
  if (a <= 0) return;
  const k = i * 3;
  img[k] += (col[0] - img[k]) * a;
  img[k + 1] += (col[1] - img[k + 1]) * a;
  img[k + 2] += (col[2] - img[k + 2]) * a;
}

function markBox(x0, y0, x1, y1) {
  if (x0 < mx0) mx0 = x0;
  if (y0 < my0) my0 = y0;
  if (x1 > mx1) mx1 = x1;
  if (y1 > my1) my1 = y1;
}

// Composite the accumulated coverage mask in one colour, then clear it.
function flush(color, alpha = 1) {
  const col = hex(color);
  for (let y = Math.max(0, my0); y <= Math.min(H - 1, my1); y++) {
    for (let x = Math.max(0, mx0); x <= Math.min(W - 1, mx1); x++) {
      const i = y * W + x;
      if (mask[i] > 0) {
        put(i, col, mask[i] * alpha);
        mask[i] = 0;
      }
    }
  }
  mx0 = W; my0 = H; mx1 = -1; my1 = -1;
}

// Capsule (thick line with round caps) into the mask.
function capsule(ax, ay, bx, by, r) {
  const x0 = Math.floor(Math.min(ax, bx) - r - 1), x1 = Math.ceil(Math.max(ax, bx) + r + 1);
  const y0 = Math.floor(Math.min(ay, by) - r - 1), y1 = Math.ceil(Math.max(ay, by) + r + 1);
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  markBox(x0, y0, x1, y1);
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay;
      let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * dx, ey = py - t * dy;
      const c = clamp01(r - Math.sqrt(ex * ex + ey * ey) + 0.5);
      const i = y * W + x;
      if (c > mask[i]) mask[i] = c;
    }
  }
}

function polyline(pts, r) {
  if (pts.length === 1) capsule(pts[0][0], pts[0][1], pts[0][0], pts[0][1], r);
  for (let k = 1; k < pts.length; k++) capsule(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], r);
}

function line(ax, ay, bx, by, r, color, alpha = 1) {
  capsule(ax, ay, bx, by, r);
  flush(color, alpha);
}

function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Filled polygon, 4x4 supersampled.
function poly(pts, color, alpha = 1) {
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(H - 1, Math.ceil(y1));
  markBox(x0, y0, x1, y1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (pointInPoly(pts, x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n++;
      const i = y * W + x;
      const c = n / 16;
      if (c > mask[i]) mask[i] = c;
    }
  }
  flush(color, alpha);
}

function rect(x, y, w, h, color, alpha = 1) {
  poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], color, alpha);
}

function roundRect(x, y, w, h, r, color, alpha = 1) {
  const cx = x + w / 2, cy = y + h / 2, hw = w / 2 - r, hh = h / 2 - r;
  const col = hex(color);
  for (let py = Math.max(0, Math.floor(y)); py <= Math.min(H - 1, Math.ceil(y + h)); py++) {
    for (let px = Math.max(0, Math.floor(x)); px <= Math.min(W - 1, Math.ceil(x + w)); px++) {
      const qx = Math.max(Math.abs(px + 0.5 - cx) - hw, 0), qy = Math.max(Math.abs(py + 0.5 - cy) - hh, 0);
      const d = Math.sqrt(qx * qx + qy * qy) - r;
      put(py * W + px, col, clamp01(0.5 - d) * alpha);
    }
  }
}

function disc(cx, cy, r, color, alpha = 1) {
  const col = hex(color);
  for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(H - 1, Math.ceil(cy + r + 1)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(W - 1, Math.ceil(cx + r + 1)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      put(y * W + x, col, clamp01(r - d + 0.5) * alpha);
    }
  }
}

function ellipse(cx, cy, rx, ry, color, alpha = 1) {
  const pts = [];
  for (let k = 0; k < 72; k++) pts.push([cx + rx * Math.cos((k * Math.PI) / 36), cy + ry * Math.sin((k * Math.PI) / 36)]);
  poly(pts, color, alpha);
}

// Disc filled by a pattern function fn(x, y) -> [r, g, b], 4x4 supersampled (used for flags).
function patternDisc(cx, cy, r, fn) {
  for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(H - 1, Math.ceil(cy + r + 1)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(W - 1, Math.ceil(cx + r + 1)); x++) {
      let n = 0, cr = 0, cg = 0, cb = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const u = x + (sx + 0.5) / 4, v = y + (sy + 0.5) / 4;
          if (Math.hypot(u - cx, v - cy) > r) continue;
          const c = fn((u - cx) / r, (v - cy) / r);
          n++; cr += c[0]; cg += c[1]; cb += c[2];
        }
      }
      if (n) put(y * W + x, [cr / n, cg / n, cb / n], n / 16);
    }
  }
}

function starPts(cx, cy, ro, ri, n = 5, rot = -90) {
  const pts = [];
  for (let k = 0; k < n * 2; k++) {
    const a = ((rot + (k * 180) / n) * Math.PI) / 180;
    const rr = k % 2 ? ri : ro;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pts;
}

function gradientRect(x, y, w, h, top, bottom) {
  const a = hex(top), b = hex(bottom);
  for (let py = y; py < y + h; py++) {
    const t = (py - y) / Math.max(1, h - 1);
    const c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let px = x; px < x + w; px++) put(py * W + px, c, 1);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Stroke font: cap height 10 units, y down, baseline at 10. M = move, L = line, A = elliptical arc
// (cx, cy, rx, ry, start deg, end deg; 0 deg = right, 90 deg = down).
const GLYPHS = {
  A: [6, 'M0,10 L3,0 L6,10 M1.15,6.6 L4.85,6.6'],
  B: [5.8, 'M0,4.8 L3.6,4.8 M0,10 L0,0 L3.4,0 A3.4,2.4,2.1,2.4,-90,90 M3.6,4.8 A3.6,7.4,2.2,2.6,-90,90 L0,10'],
  C: [6, 'A3.3,5,3.1,5,-48,-312'],
  D: [6.2, 'M0,0 L0,10 L2.6,10 A2.6,5,3.6,5,90,-90 L0,0'],
  E: [5.2, 'M5.2,0 L0,0 L0,10 L5.2,10 M0,4.9 L4.4,4.9'],
  F: [5, 'M5,0 L0,0 L0,10 M0,4.9 L4.2,4.9'],
  G: [6.4, 'A3.3,5,3.1,5,-48,-360 L3.6,5'],
  H: [6, 'M0,0 L0,10 M6,0 L6,10 M0,5 L6,5'],
  I: [0, 'M0,0 L0,10'],
  J: [4.6, 'M4.6,0 L4.6,7.3 A2.4,7.3,2.2,2.7,0,180'],
  K: [5.8, 'M0,0 L0,10 M5.6,0 L0,6.2 M1.9,4.1 L5.8,10'],
  L: [5, 'M0,0 L0,10 L5,10'],
  M: [7.4, 'M0,10 L0,0 L3.7,7.4 L7.4,0 L7.4,10'],
  N: [6, 'M0,10 L0,0 L6,10 L6,0'],
  O: [6.8, 'A3.4,5,3.4,5,0,360'],
  P: [5.6, 'M0,10 L0,0 L3.2,0 A3.2,2.7,2.4,2.7,-90,90 L0,5.4'],
  Q: [6.8, 'A3.4,5,3.4,5,0,360 M4,7.2 L6.9,10.4'],
  R: [5.8, 'M0,10 L0,0 L3.2,0 A3.2,2.7,2.4,2.7,-90,90 L0,5.4 M2.8,5.4 L5.8,10'],
  S: [5.8, 'A2.9,2.55,2.7,2.55,-20,-270 A2.9,7.45,2.9,2.55,-90,160'],
  T: [6, 'M0,0 L6,0 M3,0 L3,10'],
  U: [6, 'M0,0 L0,6.8 A3,6.8,3,3.2,180,0 L6,0'],
  V: [6.2, 'M0,0 L3.1,10 L6.2,0'],
  W: [8.6, 'M0,0 L2.1,10 L4.3,2.2 L6.5,10 L8.6,0'],
  X: [6, 'M0,0 L6,10 M6,0 L0,10'],
  Y: [6, 'M0,0 L3,5.2 L6,0 M3,5.2 L3,10'],
  Z: [5.8, 'M0,0 L5.8,0 L0,10 L5.8,10'],
  0: [5.8, 'A2.9,5,2.9,5,0,360'],
  1: [3.2, 'M0,2.1 L3.2,0 L3.2,10'],
  2: [5.8, 'A2.9,2.9,2.8,2.9,-165,22 L0,10 L5.9,10'],
  3: [5.8, 'A2.9,2.5,2.6,2.5,-160,90 A2.9,7.5,2.9,2.5,-90,165'],
  4: [6, 'M4.6,10 L4.6,0 L0,7 L6.2,7'],
  5: [5.8, 'M5.4,0 L0.9,0 L0.5,4.8 A2.9,6.9,2.9,3.1,-136,150'],
  6: [5.8, 'M4.8,0 L0.9,5.3 M5.8,6.9 A2.9,6.9,2.9,3.1,0,360'],
  7: [5.8, 'M0,0 L5.8,0 L1.8,10'],
  8: [6, 'A3,2.5,2.6,2.5,90,450 A3,7.5,3,2.5,-90,270'],
  9: [5.8, 'M1,10 L4.9,4.7 M5.8,3.1 A2.9,3.1,2.9,3.1,0,360'],
  ' ': [3.2, ''],
  '.': [0, 'M0,10 L0,10'],
  ',': [0.6, 'M0.6,9.6 L-0.2,11.8'],
  ':': [0, 'M0,3.6 L0,3.6 M0,10 L0,10'],
  ';': [0.6, 'M0.6,3.6 L0.6,3.6 M0.6,9.6 L-0.2,11.8'],
  '-': [3.6, 'M0,5.6 L3.6,5.6'],
  "'": [0, 'M0,0 L0,3'],
  '"': [1.8, 'M0,0 L0,3 M1.8,0 L1.8,3'],
  '/': [4, 'M0,10.5 L4,-0.5'],
  '$': [5.8, 'A2.9,2.55,2.7,2.55,-20,-270 A2.9,7.45,2.9,2.55,-90,160 M2.9,-1.4 L2.9,11.4'],
  '(': [2.2, 'A5.4,5,5.4,6.2,-128,-232'],
  ')': [2.2, 'A-3.2,5,5.4,6.2,-52,52'],
  '·': [0, 'M0,5.4 L0,5.4'],
  '%': [7, 'A1.5,2,1.5,2,0,360 M6.6,0 L0.4,10 M7,8 A5.5,8,1.5,2,0,360'],
};

const parsed = {};
function glyph(ch) {
  if (parsed[ch]) return parsed[ch];
  const def = GLYPHS[ch] || GLYPHS[' '];
  const paths = [];
  let cur = null;
  const re = /([MLA])([^MLA]*)/g;
  let m;
  while ((m = re.exec(def[1]))) {
    const v = m[2].trim().split(/[ ,]+/).map(Number);
    if (m[1] === 'M') { cur = [[v[0], v[1]]]; paths.push(cur); }
    else if (m[1] === 'L') cur.push([v[0], v[1]]);
    else {
      const [cx, cy, rx, ry, a0, a1] = v;
      const steps = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 7.5));
      if (!cur) { cur = []; paths.push(cur); }
      for (let k = 0; k <= steps; k++) {
        const a = ((a0 + ((a1 - a0) * k) / steps) * Math.PI) / 180;
        cur.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
      }
    }
  }
  parsed[ch] = { w: def[0], paths };
  return parsed[ch];
}

// Text style: size = cap height in px, weight = stroke radius in font units, track = gap in font units.
function measure(str, size, weight = 0.7, track = 2.4) {
  const u = size / 10;
  let w = 0;
  const s = str.toUpperCase();
  for (let k = 0; k < s.length; k++) w += (glyph(s[k]).w + (k < s.length - 1 ? track + weight * 2 : 0)) * u;
  return w + weight * 2 * u;
}

function text(str, x, y, size, color, weight = 0.7, track = 2.4, alpha = 1) {
  const u = size / 10;
  const s = str.toUpperCase();
  let pen = x + weight * u;
  for (let k = 0; k < s.length; k++) {
    const g = glyph(s[k]);
    for (const p of g.paths) polyline(p.map(([px, py]) => [pen + px * u, y + py * u]), weight * u);
    pen += (g.w + track + weight * 2) * u;
  }
  flush(color, alpha);
  return pen - x;
}

function textCenter(str, cx, y, size, color, weight, track) {
  return text(str, cx - measure(str, size, weight, track) / 2, y, size, color, weight, track);
}

function wrap(str, size, maxw, weight, track) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (cur && measure(next, size, weight, track) > maxw) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function para(str, x, y, size, lh, maxw, color, weight, track) {
  const lines = wrap(str, size, maxw, weight, track);
  lines.forEach((l, k) => text(l, x, y + k * lh, size, color, weight, track));
  return y + lines.length * lh;
}

// ---------------------------------------------------------------------------------------------------------------
// Flags as discs (simple geometric renditions).
const C = (h) => hex(h);
const usFlag = (u, v) => {
  if (u < 0.05 && v < -0.02) {
    const gx = ((u + 1) * 7) % 1, gy = ((v + 1) * 7) % 1;
    return (gx - 0.5) ** 2 + (gy - 0.5) ** 2 < 0.06 ? C('#ffffff') : C('#22336b');
  }
  return Math.floor((v + 1) * 6.5) % 2 ? C('#f4f4f4') : C('#c8102e');
};
const cnStar = starPts(-0.42, -0.36, 0.3, 0.12);
const cnSmall = [[0.02, -0.7], [0.2, -0.48], [0.2, -0.18], [0.02, 0.04]].map(([a, b]) => starPts(a, b, 0.1, 0.04));
const cnFlag = (u, v) => (pointInPoly(cnStar, u, v) || cnSmall.some((s) => pointInPoly(s, u, v)) ? C('#ffde00') : C('#de2910'));
const ruFlag = (u, v) => (v < -0.33 ? C('#ffffff') : v < 0.33 ? C('#0039a6') : C('#d52b1e'));
const dkFlag = (u, v) => (Math.abs(v) < 0.14 || Math.abs(u + 0.25) < 0.14 ? C('#ffffff') : C('#c8102e'));
const glFlag = (u, v) => {
  const inCircle = Math.hypot(u + 0.2, v) < 0.48;
  const top = v < 0;
  return (inCircle ? !top : top) ? C('#ffffff') : C('#d00c33');
};
const uaFlag = (u, v) => (v < 0 ? C('#0057b7') : C('#ffd700'));

function flagDisc(cx, cy, r, fn) {
  disc(cx, cy, r + 4, '#0b1220', 0.55);
  patternDisc(cx, cy, r, fn);
  capsuleRing(cx, cy, r, 2, '#e8edf5', 0.9);
}

function capsuleRing(cx, cy, r, w, color, alpha = 1) {
  const pts = [];
  for (let k = 0; k <= 96; k++) pts.push([cx + r * Math.cos((k * Math.PI) / 48), cy + r * Math.sin((k * Math.PI) / 48)]);
  polyline(pts, w);
  flush(color, alpha);
}

function arcStroke(cx, cy, r, a0, a1, w, color, alpha = 1) {
  const pts = [];
  const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 4));
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  polyline(pts, w);
  flush(color, alpha);
}

// ---------------------------------------------------------------------------------------------------------------
// Palette and canvas.
const BG = '#0d1523';
const PANEL = '#16213a';
const INK = '#f3f5f9';
const MUTED = '#a9b4c8';
gradientRect(0, 0, W, H, '#111b2e', '#0a101b');

// Masthead.
textCenter('THE WORLD IN ONE PICTURE', W / 2, 20, 14, '#e0b25b', 0.6, 5.5);
const DATE = 'THURSDAY 19 NOVEMBER 2026';
const dateSize = Math.min(54, (48 * 940) / measure(DATE, 48, 0.85, 1.6));
textCenter(DATE, W / 2, 100 - dateSize - 4, dateSize, INK, 0.85, 1.6);
rect(24, 110, W - 48, 3, '#e0b25b');

// ---------------------------------------------------------------------------------------------------------------
// Hero: the Shenzhen summit.
const HY = 124, HH = 330;
roundRect(24, HY, W - 48, HH, 14, PANEL);
gradientRect(36, HY + 12, 400, HH - 24, '#1f3150', '#142039');
// Table seen from above with the declaration on it.
ellipse(236, HY + 196, 168, 82, '#0d1728', 0.6);
ellipse(236, HY + 188, 162, 76, '#3c5a86');
ellipse(236, HY + 186, 150, 66, '#2b4468');
poly([[204, HY + 160], [272, HY + 152], [280, HY + 214], [212, HY + 222]], '#f2efe6');
for (let k = 0; k < 5; k++) line(216 + k * 0.4, HY + 170 + k * 9, 262 + k * 0.4, HY + 165 + k * 9, 1.1, '#8a93a6');
textCenter('DECLARATION', 242, HY + 228, 10, '#e0b25b', 0.6, 1.8);
// Seats: Xi (host, top), Trump (left), Putin (right).
flagDisc(236, HY + 70, 46, cnFlag);
flagDisc(92, HY + 228, 46, usFlag);
flagDisc(380, HY + 228, 46, ruFlag);
textCenter('XI', 236, HY + 124, 18, INK, 0.75, 2.4);
textCenter('TRUMP', 92, HY + 282, 18, INK, 0.75, 2.4);
textCenter('PUTIN', 380, HY + 282, 18, INK, 0.75, 2.4);

const TX = 460, TW = 530;
text('SHENZHEN, CHINA · APEC', TX, HY + 22, 16, '#e0b25b', 0.65, 2.8);
let ty = para('TRUMP, XI AND PUTIN HOLD FIRST-EVER THREE-WAY SUMMIT', TX, HY + 54, 31, 42, TW, INK, 0.8, 1.7);
rect(TX, ty + 2, 60, 3, '#e0b25b');
ty = para("JOINT DECLARATION: A NUCLEAR WAR 'CANNOT BE WON AND MUST NEVER BE FOUGHT'", TX, ty + 18, 16, 23, TW, '#dfe5ef', 0.62, 1.8);
para('PLEDGES ON NUCLEAR-RISK TALKS AND UN REFORM; NO MAJOR BREAKTHROUGH', TX, ty + 8, 14, 20, TW, MUTED, 0.55, 1.8);

// ---------------------------------------------------------------------------------------------------------------
// Six story panels.
const icons = {
  court(x, y, w, h, acc) {
    const cx = x + w / 2, top = y + 14;
    line(cx, top, cx, y + h - 14, 2.6, acc);
    line(cx - 60, top + 12, cx + 60, top + 12, 2.6, acc);
    rect(cx - 26, y + h - 16, 52, 6, acc);
    for (const s of [-1, 1]) {
      const px = cx + s * 60;
      line(px, top + 12, px - 18, top + 42, 1.3, acc);
      line(px, top + 12, px + 18, top + 42, 1.3, acc);
      poly([[px - 22, top + 42], [px + 22, top + 42], [px + 14, top + 52], [px - 14, top + 52]], acc);
    }
    disc(cx, top, 5, acc);
  },
  market(x, y, w, h, acc) {
    const x0 = x + 54, x1 = x + w - 54, yb = y + h - 14;
    line(x0, yb, x1, yb, 1.2, '#5b6b88');
    line(x0, y + 12, x0, yb, 1.2, '#5b6b88');
    const pts = [[x0 + 6, yb - 12], [x0 + 40, yb - 22], [x0 + 70, yb - 16], [x0 + 104, yb - 40], [x0 + 132, yb - 34], [x1 - 14, y + 18]];
    poly([...pts, [x1 - 14, yb], [x0 + 6, yb]], acc, 0.18);
    polyline(pts, 2.6);
    flush(acc);
    poly([[x1 - 4, y + 10], [x1 - 26, y + 14], [x1 - 12, y + 30]], acc);
    roundRect(x0 + 10, y + 12, 56, 24, 5, acc);
    text('ANT', x0 + 18, y + 18, 12, '#0d1523', 0.75, 2.2);
  },
  bridge(x, y, w, h, acc) {
    const yb = y + h - 26;
    rect(x + 14, yb + 10, w - 28, h - 10 - (yb + 10 - y) - 6, '#1d4d7a');
    for (let k = 0; k < 3; k++) line(x + 30 + k * 40, yb + 18 + k * 4, x + 60 + k * 40, yb + 18 + k * 4, 1, '#6aa3d6', 0.6);
    line(x + 20, yb - 6, x + w - 20, yb - 6, 3, '#c9d2e0');
    for (let k = 0; k < 5; k++) {
      const ax = x + 30 + k * ((w - 60) / 5);
      arcStroke(ax + (w - 60) / 10, yb + 10, (w - 60) / 10, 180, 360, 2, '#c9d2e0');
    }
    const bx = x + w * 0.58, by = yb - 18;
    poly(starPts(bx, by, 30, 13, 9), '#ff7a1a');
    poly(starPts(bx, by, 17, 8, 7, -70), '#ffd23f');
    disc(bx + 30, y + 14, 3, '#ffd23f', 0.7);
    patternDisc(x + 30, y + 24, 13, uaFlag);
  },
  gulf(x, y, w, h, acc) {
    poly([[x + 14, y + h - 10], [x + 70, y + h - 22], [x + 120, y + h - 16], [x + 190, y + h - 30], [x + w - 14, y + h - 22], [x + w - 14, y + h - 6], [x + 14, y + h - 6]], '#7b6a4b');
    const shots = [[x + 40, y + 20, x + 130, y + h - 30], [x + 70, y + 12, x + 210, y + h - 36], [x + 30, y + 40, x + 250, y + h - 30]];
    for (const [ax, ay, bx, by] of shots) {
      const pts = [];
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        pts.push([ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * 26]);
      }
      for (let k = 0; k < 20; k += 2) capsule(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 1.4);
      flush(acc, 0.9);
      disc(bx, by, 4, '#ffd23f');
    }
    poly(starPts(x + 230, y + 30, 16, 7, 8), '#ffd23f');
    disc(x + 230, y + 30, 5, '#ffffff');
  },
  arctic(x, y, w, h, acc) {
    rect(x + 14, y + h - 22, w - 28, 16, '#1d4d7a');
    poly([[x + 60, y + h - 22], [x + 96, y + 16], [x + 122, y + 34], [x + 150, y + 8], [x + 190, y + h - 22]], '#e9f3fb');
    poly([[x + 96, y + 16], [x + 122, y + 34], [x + 110, y + h - 22], [x + 84, y + h - 22]], '#bcd6ea');
    flagDisc(x + 214, y + 28, 15, dkFlag);
    flagDisc(x + 250, y + 50, 15, glFlag);
    flagDisc(x + 214, y + 64, 15, usFlag);
  },
  cyclone(x, y, w, h, acc) {
    const cx = x + w / 2 - 30, cy = y + h / 2;
    for (let arm = 0; arm < 3; arm++) {
      const pts = [];
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        const a = arm * 2.094 + t * 3.6;
        const r = 6 + t * 34;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a) * 0.9]);
      }
      polyline(pts, 3.2 - arm * 0.3);
      flush(acc);
    }
    disc(cx, cy, 6, '#0d1523');
    poly([[x + w - 30, y + 8], [x + w - 70, y + 30], [x + w - 60, y + 60], [x + w - 92, y + h - 8], [x + w - 14, y + h - 8], [x + w - 14, y + 8]], '#5f7f52');
    line(cx + 50, cy, x + w - 78, cy + 6, 1.6, '#ffffff', 0.8);
    poly([[x + w - 72, cy + 6], [x + w - 84, cy], [x + w - 82, cy + 13]], '#ffffff', 0.8);
  },
};

const stories = [
  { icon: 'court', acc: '#e0b25b', kick: 'THE HAGUE · WORLD COURT', head: 'ICJ RULES MYANMAR COMMITTED GENOCIDE', sub: 'AGAINST THE ROHINGYA - THE FIRST STATE THE COURT HAS EVER FOUND GUILTY OF GENOCIDE' },
  { icon: 'market', acc: '#3ddc97', kick: 'NEW YORK · MARKETS', head: 'ANTHROPIC SHARES DEBUT ON NASDAQ', sub: 'RECORD $81BN IPO PRICED AT $83 A SHARE, TICKER ANT' },
  { icon: 'bridge', acc: '#ffd23f', kick: 'UKRAINE WAR', head: 'UKRAINE STRIKES CRIMEA BRIDGE AGAIN', sub: 'RUSSIA CLOSES THE RAIL SECTION OF THE KERCH BRIDGE' },
  { icon: 'gulf', acc: '#ff8a3d', kick: 'IRAN WAR · GULF', head: 'IRAN WIDENS ATTACKS ON GULF STATES', sub: 'DRONES AT KUWAIT AND BAHRAIN; HOUTHI MISSILE DOWNED OVER RIYADH' },
  { icon: 'arctic', acc: '#8fd3ff', kick: 'DENMARK · ARCTIC', head: 'DANISH MPS BACK ARCTIC DEAL WITH US', sub: 'UNANIMOUS VOTE FOR GREENLAND SECURITY PACT' },
  { icon: 'cyclone', acc: '#4fd1c5', kick: 'INDIA · WEATHER', head: 'CYCLONE AKVAN NEARS INDIA', sub: 'ANDHRA PRADESH BRACES; LANDFALL EXPECTED ON 20 NOV' },
];

const GY = 466, PW = 317, PH = 248, GAP = 12;
stories.forEach((s, k) => {
  const col = k % 3, row = Math.floor(k / 3);
  const x = 24 + col * (PW + GAP), y = GY + row * (PH + GAP);
  roundRect(x, y, PW, PH, 12, PANEL);
  roundRect(x + 8, y + 8, PW - 16, 84, 8, '#1d2b48');
  icons[s.icon](x + 8, y + 8, PW - 16, 84, s.acc);
  rect(x + 16, y + 102, 4, 13, s.acc);
  text(s.kick, x + 26, y + 102, 13, s.acc, 0.62, 2.4);
  // Fit headline and sub-line into the panel: shrink the type until both fit above its bottom edge.
  const maxw = PW - 32;
  let hs = 21;
  for (; hs > 14; hs--) {
    const hl = wrap(s.head, hs, maxw, 0.75, 1.7).length;
    const sl = wrap(s.sub, Math.round(hs * 0.66), maxw, 0.55, 1.8).length;
    if (124 + hl * hs * 1.32 + 6 + sl * Math.round(hs * 0.66) * 1.45 <= PH - 10) break;
  }
  const ss = Math.round(hs * 0.66);
  const yy = para(s.head, x + 16, y + 124, hs, Math.round(hs * 1.32), maxw, INK, 0.75, 1.7);
  para(s.sub, x + 16, yy + 6, ss, Math.round(ss * 1.45), maxw, MUTED, 0.55, 1.8);
});

// Footer.
textCenter('SOURCES: AP · REUTERS · CNN · AL JAZEERA · CNBC · BLOOMBERG · IMD', W / 2, 1000, 11, '#7f8ba3', 0.55, 2.4);

// ---------------------------------------------------------------------------------------------------------------
// PNG encoder (RGB, 8 bit, filter 0, zlib level 9).
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const raw = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  for (let x = 0; x < W * 3; x++) raw[y * (W * 3 + 1) + 1 + x] = Math.round(clamp01(img[y * W * 3 + x]) * 255);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png'), png);
