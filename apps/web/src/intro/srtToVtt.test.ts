import { describe, expect, it } from 'vitest';
import { srtToVtt } from './srtToVtt';

const SRT = `1
00:00:00,750 --> 00:00:03,908
Rosa teje fibra de alpaca desde hace más de quince años,

2
00:00:03,908 --> 00:00:05,959
en un taller familiar de Juliaca.
`;

describe('srtToVtt', () => {
  it('adds the WEBVTT header', () => {
    expect(srtToVtt(SRT).startsWith('WEBVTT\n\n')).toBe(true);
  });
  it('turns comma milliseconds into dots', () => {
    const vtt = srtToVtt(SRT);
    expect(vtt).toContain('00:00:00.750 --> 00:00:03.908');
    expect(vtt).not.toMatch(/\d,\d{3}/);
  });
  it('keeps the cue text, including accents and commas', () => {
    expect(srtToVtt(SRT)).toContain('Rosa teje fibra de alpaca desde hace más de quince años,');
  });
  it('handles Windows line endings and a BOM', () => {
    const vtt = srtToVtt('﻿' + SRT.replace(/\n/g, '\r\n'));
    expect(vtt).not.toContain('\r');
    expect(vtt).not.toContain('﻿');
    expect(vtt).toContain('00:00:03.908 --> 00:00:05.959');
  });
  it('does not touch commas inside the text', () => {
    expect(srtToVtt('1\n00:00:01,000 --> 00:00:02,000\nUno, dos, tres\n')).toContain('Uno, dos, tres');
  });
});
