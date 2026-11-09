/**
 * The intro video. To swap in a new cut, run `pnpm --filter @izumi/web intro:media <path-to-mp4>`
 * (transcodes the web copy, converts the .srt next to it to .vtt, extracts the poster) and bump `version`
 * so people who saw the previous cut see the new one.
 */
export const INTRO_MEDIA = {
  version: 'v1',
  video: '/media/procto-intro.mp4',
  captions: '/media/procto-intro.es.vtt',
  poster: '/media/procto-intro-poster.jpg',
  /** Shown on the play button. */
  durationLabel: '3 min',
} as const;
