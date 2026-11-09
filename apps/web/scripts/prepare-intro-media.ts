/**
 * Builds the web copy of the intro video from a master render.
 *
 *   pnpm --filter @izumi/web intro:media D:/proyectos/PROCTO-video/out/PROCTO-explicacion-3min-v2.mp4
 *
 * Captions are read from <name>.es.vtt / <name>.vtt (copied) or <name>.es.srt (converted); the poster from
 * <name>-poster.png (falls back to a frame at 2 s). A "-web" or "-vN" suffix on <name> is tried without too. Output goes to public/media/ using the names in src/intro/media.ts.
 * Requires ffmpeg on PATH. Bump `version` in src/intro/media.ts afterwards.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { srtToVtt } from '../src/intro/srtToVtt';

const source = process.argv[2];
if (!source || !existsSync(source)) {
  console.error('Usage: intro:media <master.mp4>');
  process.exit(1);
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/media');
mkdirSync(out, { recursive: true });
const base = source.replace(/\.mp4$/i, '');
const run = (args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

// 1280x720 H.264 (CRF 26), AAC 128k, faststart so playback starts before the download ends.
run([
  '-i', source,
  '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
  '-c:v', 'libx264', '-crf', '26', '-preset', 'medium', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
  join(out, 'procto-intro.mp4'),
]);

// Companion files are looked up next to the master, then under the same name without "-web" / "-vN" suffixes.
const bases = [base, base.replace(/-web$/, ''), base.replace(/-v\d+(-web)?$/, '')];
const find = (suffixes: string[]) => bases.flatMap((b) => suffixes.map((s) => `${b}${s}`)).find(existsSync);

const posterSource = find(['-poster.png', '-poster.jpg']);
if (posterSource) run(['-i', posterSource, '-vf', 'scale=1280:-2', '-q:v', '4', join(out, 'procto-intro-poster.jpg')]);
else run(['-ss', '2', '-i', source, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '4', join(out, 'procto-intro-poster.jpg')]);

const vtt = find(['.es.vtt', '.vtt']);
const srt = find(['.es.srt', '.srt']);
if (vtt) copyFileSync(vtt, join(out, 'procto-intro.es.vtt'));
else if (srt) writeFileSync(join(out, 'procto-intro.es.vtt'), srtToVtt(readFileSync(srt, 'utf8')), 'utf8');
else console.warn('No .vtt or .srt found next to the video: captions were not updated.');

const mb = statSync(join(out, 'procto-intro.mp4')).size / 1024 / 1024;
console.log(`procto-intro.mp4 ${mb.toFixed(1)} MB${mb > 25 ? ' (over the 25 MB target)' : ''}`);
