// main.ts — the hand-in program for this make.fun frontend entry.
// Node 22+, standard library only, no network, no build step.
//
// An entry is the static app in app/ plus the screenshots in
// screenshots/. This program assembles the hand-in in the output
// directory (MAKEFUN_OUTPUT_DIR, or /output where the grader runs
// it): it copies both trees across, confirms the files the app
// cannot start without are present, checks every screenshot against
// the gate's caps from the image bytes themselves, then builds
// dossier.json with the kit library in vendor/ — twice — and only
// reports success when both builds agree byte for byte, which is
// the same comparison the grader will make.
//
// One rule about the output directory matters more than any other:
// it is CREATED when missing and EMPTIED entry by entry, but never
// removed itself. In the grader the output directory is a mount
// point on a read-only filesystem; removing it is impossible and
// the attempt ends the run with exit code 1.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

// The gate's caps, restated here so a bad hand-in fails in this log
// with a plain reason instead of failing silently at the gate.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
  app_path_max_bytes: 1000,
};

// Files the app cannot open without; the hand-in is refused when
// any of them is missing from the output copy.
const ENTRY_FILES = ['index.html', 'boot.js', 'net.js', 'text.js', 'theme.css'];

function refuse(why) {
  throw new Error(`hand-in refused: ${why}`);
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

// Copy a tree file by file with our own walk, so a symlink or other
// special entry in the source is noticed and refused rather than
// silently followed.
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    const info = statSync(src);
    if (info.isDirectory()) copyTree(src, dst);
    else if (info.isFile()) copyFileSync(src, dst);
    else refuse(`${src} is neither a file nor a directory`);
  }
}

// Empty a directory entry by entry. The directory itself stays:
// where the grader runs this program it is a mount point, and
// removing it is exactly the failure this avoids.
function emptyDir(dir) {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    rmSync(join(dir, name), { recursive: true, force: true });
  }
}

// Image sizes read from the bytes: a PNG stores its dimensions in
// the IHDR chunk (big-endian at bytes 16..24); a JPEG stores them in
// a start-of-frame segment, reached by walking the marker chain.
function pngDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: view.getUint32(16), h: view.getUint32(20) };
}

function jpegDimensions(bytes) {
  let at = 2; // skip the SOI marker
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) refuse('malformed JPEG: marker expected');
    const code = bytes[at + 1];
    const segLen = bytes[at + 2] * 256 + bytes[at + 3];
    if (code === 0xc0 || code === 0xc1 || code === 0xc2) {
      return { w: bytes[at + 7] * 256 + bytes[at + 8], h: bytes[at + 5] * 256 + bytes[at + 6] };
    }
    at += 2 + segLen;
  }
  refuse('no frame header found in JPEG');
}

function checkScreenshots(dir) {
  const names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
  if (names.length === 0) refuse('screenshots/ holds no image');
  if (names.length > CAPS.screenshots.max) {
    refuse(`${names.length} screenshots handed in, the cap is ${CAPS.screenshots.max}`);
  }
  return names.map((name) => {
    const bytes = readFileSync(join(dir, name));
    if (bytes.length > CAPS.screenshots.max_bytes) {
      refuse(`${name} is ${bytes.length} bytes, over the ${CAPS.screenshots.max_bytes} cap`);
    }
    const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let dims;
    if (head.getUint16(0) === 0xffd8) dims = jpegDimensions(bytes);
    else if (head.getUint32(0) === 0x89504e47) dims = pngDimensions(bytes);
    else refuse(`${name} is neither a JPEG nor a PNG`);
    const longSide = Math.max(dims.w, dims.h);
    const shortSide = Math.min(dims.w, dims.h);
    if (longSide > 1280 || shortSide < 360) {
      refuse(`${name} is ${dims.w}x${dims.h}, outside the allowed bounds`);
    }
    return `${name} ${dims.w}x${dims.h} ${bytes.length} B`;
  });
}

function main() {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  if (out === root) refuse('the output directory must differ from the repository root');
  console.log(`Handing in ${root} -> ${out}`);

  emptyDir(out);
  copyTree(join(root, 'app'), join(out, 'app'));
  copyTree(join(root, 'screenshots'), join(out, 'screenshots'));

  for (const name of ENTRY_FILES) {
    if (!existsSync(join(out, 'app', name))) refuse(`app/${name} missing from the output`);
  }
  console.log(`All ${ENTRY_FILES.length} entry files are in the output`);

  const shots = checkScreenshots(join(out, 'screenshots'));
  console.log(`Screenshots inside their caps: ${shots.join('; ')}`);

  const dossier = buildDossier(out, CAPS);
  if (dossier.length === 0) refuse('buildDossier returned no bytes');
  writeFileSync(join(out, 'dossier.json'), dossier);

  if (!sameBytes(readFileSync(join(out, 'dossier.json')), dossier)) {
    refuse('dossier.json on disk differs from the bytes just built');
  }
  if (!sameBytes(buildDossier(out, CAPS), dossier)) {
    refuse('rebuilding the dossier from the output gave different bytes');
  }

  const parsed = JSON.parse(new TextDecoder().decode(dossier));
  const totals = String(parsed.text ?? '').split('\n').find((line) => line.startsWith('Totals:'));
  if (!totals) refuse('the dossier text holds no Totals line');
  console.log(`dossier.json: ${dossier.length} bytes`);
  console.log(totals);
}

main();
