/** Remembers which cut of the intro video the visitor already saw. Storage may be missing or throw (private mode). */
import { INTRO_MEDIA } from './media';

export type IntroStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const INTRO_KEY = 'procto.intro.v1';

function browserStorage(): IntroStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function isIntroSeen(storage: IntroStorage | null = browserStorage(), version: string = INTRO_MEDIA.version): boolean {
  try {
    return storage?.getItem(INTRO_KEY) === version;
  } catch {
    return false;
  }
}

export function markIntroSeen(version: string = INTRO_MEDIA.version, storage: IntroStorage | null = browserStorage()): void {
  try {
    storage?.setItem(INTRO_KEY, version);
  } catch {
    // Without storage the video may show again next visit; acceptable.
  }
}

export function resetIntroSeen(storage: IntroStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(INTRO_KEY);
  } catch {
    // ignore
  }
}
