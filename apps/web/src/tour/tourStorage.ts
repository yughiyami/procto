/** Remembers that the guided tour was finished or skipped. Storage may be missing or throw (private mode). */

export type TourStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const TOUR_KEY = 'procto.tour.v1';

function browserStorage(): TourStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function isTourDone(storage: TourStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(TOUR_KEY) === 'done';
  } catch {
    return false;
  }
}

export function markTourDone(storage: TourStorage | null = browserStorage()): void {
  try {
    storage?.setItem(TOUR_KEY, 'done');
  } catch {
    // Without storage the tour may show again next visit; that is acceptable.
  }
}

export function resetTour(storage: TourStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(TOUR_KEY);
  } catch {
    // ignore
  }
}
