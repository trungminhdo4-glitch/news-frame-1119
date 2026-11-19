// News frame for Thursday 19 November 2026: writes the day's one-page world news image to /output/entry.png.
// Node 22, standard library only, no network. The page is drawn in design/front.html (layout and every
// illustration hand-written as HTML/SVG) and rendered once to entry.png by design/render.mjs.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const png = readFileSync(join(here, 'entry.png'));

// Refuse to hand over anything the gate would reject: a PNG with every chunk whole and its CRC right,
// an IHDR within 1024 x 1024, an IEND at the very end, and at most 1 MiB in all.
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
function check(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length > 1048576) throw new Error(`entry.png is ${buf.length} bytes, over 1 MiB`);
  if (!sig.every((b, i) => buf[i] === b)) throw new Error('entry.png has no PNG signature');
  let at = 8, sawEnd = false, chunks = 0;
  while (at < buf.length) {
    if (at + 12 > buf.length) throw new Error('truncated chunk header');
    const len = buf.readUInt32BE(at);
    const type = buf.toString('ascii', at + 4, at + 8);
    if (at + 12 + len > buf.length) throw new Error(`chunk ${type} runs past the end`);
    if (crc32(buf.subarray(at + 4, at + 8 + len)) !== buf.readUInt32BE(at + 8 + len)) throw new Error(`bad CRC in ${type}`);
    if (chunks === 0) {
      if (type !== 'IHDR') throw new Error('first chunk is not IHDR');
      const w = buf.readUInt32BE(at + 8), h = buf.readUInt32BE(at + 12);
      if (w < 1 || h < 1 || w > 1024 || h > 1024) throw new Error(`entry.png is ${w}x${h}, over 1024 px`);
    }
    chunks++;
    at += 12 + len;
    if (type === 'IEND') { sawEnd = true; break; }
  }
  if (!sawEnd || at !== buf.length) throw new Error('entry.png does not end with IEND');
}

check(png);
writeFileSync(join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png'), png);
