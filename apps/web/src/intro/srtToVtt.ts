/** Converts SubRip captions to WebVTT, the only caption format <track> accepts. Pure; unit-tested. */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    // Only the timing lines use comma milliseconds; cue text is left alone.
    .replace(/^(\d{2}:\d{2}:\d{2}),(\d{3}) --> (\d{2}:\d{2}:\d{2}),(\d{3})/gm, '$1.$2 --> $3.$4')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}
