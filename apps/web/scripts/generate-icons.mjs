/**
 * Rasterizes the PROCTO mark into the PWA icon set and the pitch/video brand kit.
 *
 * Run with: pnpm --filter @izumi/web icons
 *
 * The source of truth is packages/ui/src/brand/procto-mark.svg (white shield, indigo threads,
 * gold knot, designed to sit on the ink tile). Edit that, then re-run this. Maskable icons get
 * extra padding because Android crops them to a platform-defined shape; the safe zone is the
 * central 80% of the canvas.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const markPath = resolve(here, '../../../packages/ui/src/brand/procto-mark.svg');
const iconsDir = resolve(here, '../public/icons');
const brandDir = resolve(here, '../public/brand');

const INK = '#15182b';
const WHITE = '#ffffff';

const mark = await readFile(markPath, 'utf8');
const body = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
/** Small sizes need heavier threads to stay legible at 16px. */
const heavy = body.replace('stroke-width="2.4"', 'stroke-width="3.2"');

function tile(size, padRatio, { content = body, rounded = true } = {}) {
  const inner = size * (1 - padRatio * 2);
  const offset = (size - inner) / 2;
  const radius = rounded ? Math.round(size * 0.22) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${INK}"/>
  <g transform="translate(${offset} ${offset}) scale(${inner / 32})">${content}</g>
</svg>`;
}

/**
 * Monoline wordmark drawn with strokes (no font dependency, so it renders the same in
 * a video editor, a slide deck or a browser). Cap height 40, stroke 6.
 */
const LETTERS = [
  { x: 0, d: 'M0 40V0H11A10.5 10.5 0 0 1 11 21H0' },
  { x: 36, d: 'M0 40V0H11A10.5 10.5 0 0 1 11 21H0M11 21L23 40' },
  { x: 76, d: 'M14 0A14 20 0 1 0 14 40A14 20 0 1 0 14 0Z' },
  { x: 118, d: 'M24.7 7.1A14 20 0 1 0 24.7 32.9' },
  { x: 156, d: 'M0 0H26M13 0V40' },
  { x: 196, d: 'M14 0A14 20 0 1 0 14 40A14 20 0 1 0 14 0Z' },
];

function wordmark(color) {
  const paths = LETTERS.map((l) => `<path transform="translate(${l.x} 0)" d="${l.d}"/>`).join('');
  return `<g fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
}

function logo(textColor) {
  // 72px tile at x=4; wordmark starts at x=96; letters span ~228 wide.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 80" width="340" height="80" role="img" aria-label="PROCTO">
  <title>PROCTO</title>
  <g transform="translate(4 4)">
    <rect width="72" height="72" rx="16" fill="${INK}"/>
    <g transform="translate(5 5) scale(${62 / 32})">${body}</g>
  </g>
  <g transform="translate(99 20)">${wordmark(textColor)}</g>
</svg>
`;
}

await mkdir(iconsDir, { recursive: true });
await mkdir(brandDir, { recursive: true });

const raster = [
  { dir: iconsDir, file: 'icon-192.png', svg: tile(192, 0.15) },
  { dir: iconsDir, file: 'icon-512.png', svg: tile(512, 0.15) },
  // Maskable: fill the whole square; Android paints its own shape over it.
  { dir: iconsDir, file: 'icon-512-maskable.png', svg: tile(512, 0.2, { rounded: false }) },
  { dir: iconsDir, file: 'apple-touch-icon.png', svg: tile(180, 0.15, { rounded: false }) },
  { dir: iconsDir, file: 'favicon-32.png', svg: tile(32, 0.06, { content: heavy }) },
  { dir: iconsDir, file: 'favicon-16.png', svg: tile(16, 0.04, { content: heavy }) },
  { dir: brandDir, file: 'procto-icon-1024.png', svg: tile(1024, 0.15) },
];

for (const target of raster) {
  const buffer = await sharp(Buffer.from(target.svg)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(resolve(target.dir, target.file), buffer);
  console.log(`${target.file} - ${buffer.length} bytes`);
}

await writeFile(resolve(iconsDir, 'icon.svg'), tile(512, 0.15), 'utf8');
await writeFile(resolve(iconsDir, 'favicon.svg'), tile(64, 0.05, { content: heavy }), 'utf8');
await writeFile(resolve(brandDir, 'procto-logo.svg'), logo(INK), 'utf8');
await writeFile(resolve(brandDir, 'procto-logo-light.svg'), logo(WHITE), 'utf8');
console.log('icon.svg, favicon.svg, procto-logo.svg, procto-logo-light.svg');
