/**
 * Rasterizes the product mark into the PWA icon set.
 *
 * Run with: pnpm --filter @izumi/web icons
 *
 * The source of truth is packages/ui/src/brand/izumi-mark.svg — edit that, then
 * re-run this. Maskable icons get extra padding because Android crops them to a
 * platform-defined shape; the safe zone is the central 80% of the canvas.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const markPath = resolve(here, '../../../packages/ui/src/brand/izumi-mark.svg');
const outDir = resolve(here, '../public/icons');

const BRAND = '#4338ca';
const SURFACE = '#ffffff';

/** Wraps the mark on an opaque square so the icon never sits on a transparent tile. */
function composeSvg(mark, size, padRatio) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const offset = Math.round((size - inner) / 2);
  const body = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const radius = Math.round(size * 0.22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${SURFACE}"/>
  <g transform="translate(${offset} ${offset}) scale(${inner / 32})" fill="${BRAND}">${body}</g>
</svg>`;
}

/** Maskable icons must fill the whole square: Android paints its own rounded shape. */
function composeMaskable(mark, size) {
  const inner = Math.round(size * 0.6);
  const offset = Math.round((size - inner) / 2);
  const body = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BRAND}"/>
  <g transform="translate(${offset} ${offset}) scale(${inner / 32})" fill="${SURFACE}">${body}</g>
</svg>`;
}

const mark = await readFile(markPath, 'utf8');
await mkdir(outDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', svg: composeSvg(mark, 192, 0.16), size: 192 },
  { file: 'icon-512.png', svg: composeSvg(mark, 512, 0.16), size: 512 },
  { file: 'icon-512-maskable.png', svg: composeMaskable(mark, 512), size: 512 },
  { file: 'apple-touch-icon.png', svg: composeSvg(mark, 180, 0.12), size: 180 },
  { file: 'favicon-32.png', svg: composeSvg(mark, 32, 0.08), size: 32 },
  { file: 'favicon-16.png', svg: composeSvg(mark, 16, 0.06), size: 16 },
];

for (const target of targets) {
  const buffer = await sharp(Buffer.from(target.svg)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(resolve(outDir, target.file), buffer);
  console.log(`${target.file} — ${target.size}x${target.size}, ${buffer.length} bytes`);
}

await writeFile(resolve(outDir, 'icon.svg'), composeSvg(mark, 512, 0.16), 'utf8');
console.log('icon.svg — scalable source');
