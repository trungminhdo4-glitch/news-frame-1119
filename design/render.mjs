// Renders design/front.html to entry.png at 1024x1024 with headless Microsoft Edge (dev-time only;
// the judged program, main.ts, just checks and copies the committed entry.png).
//   node design/render.mjs [path-to-msedge]
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const edge = process.argv[2] ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!existsSync(edge)) throw new Error(`browser not found: ${edge}`);

const out = join(root, 'entry.png');
rmSync(out, { force: true });
// A separate profile keeps an already-open Edge window from swallowing the headless call.
const profile = join(tmpdir(), 'news-frame-edge-profile');
execFileSync(edge, [
  '--headless=new',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=1024,1024',
  '--default-background-color=00000000',
  `--screenshot=${out}`,
  pathToFileURL(join(here, 'front.html')).href,
], { stdio: 'inherit' });

// Edge may hand back before the screenshot is flushed: wait until the file exists and its size settles.
let last = -1;
for (let tries = 0; tries < 100; tries++) {
  const size = existsSync(out) ? statSync(out).size : -1;
  if (size > 0 && size === last) break;
  last = size;
  await new Promise((r) => setTimeout(r, 200));
}
const png = readFileSync(out);
const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
console.log(`entry.png: ${w}x${h}, ${png.length} bytes`);
if (w > 1024 || h > 1024 || png.length > 1048576) throw new Error('entry.png breaks the 1024 px / 1 MiB limit');
