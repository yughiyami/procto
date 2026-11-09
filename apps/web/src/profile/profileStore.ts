/** The coordinator's business profile, kept in this browser (offline-first, like the rest of the store). */

export type Activity = 'seller' | 'coordinator' | 'both';

export type BusinessProfile = {
  name: string;
  city: string;
  activity: Activity;
  products: string[];
  /** PRO account: the platform commission drops from 3% to 2%. */
  pro: boolean;
  updatedAt: string | null;
};

export const DEFAULT_PROFILE: BusinessProfile = {
  name: '',
  city: '',
  activity: 'coordinator',
  products: [],
  pro: false,
  updatedAt: null,
};

export type ProfileStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const PROFILE_KEY = 'procto.profile.v1';

function browserStorage(): ProfileStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readProfile(storage: ProfileStorage | null = browserStorage()): BusinessProfile {
  try {
    const raw = storage?.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<BusinessProfile>;
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      products: Array.isArray(parsed.products) ? parsed.products.filter((p): p is string => typeof p === 'string') : [],
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(patch: Partial<BusinessProfile>, storage: ProfileStorage | null = browserStorage()): BusinessProfile {
  const next: BusinessProfile = { ...readProfile(storage), ...patch, updatedAt: new Date().toISOString() };
  try {
    storage?.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the value lives only for this session via the cache below.
  }
  cache = next;
  listeners.forEach((fn) => fn());
  return next;
}

let cache: BusinessProfile | null = null;
const listeners = new Set<() => void>();

export const subscribeProfile = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Stable snapshot for useSyncExternalStore (same object until the profile changes). */
export function profileSnapshot(): BusinessProfile {
  cache ??= readProfile();
  return cache;
}

export const isProfileComplete = (p: BusinessProfile): boolean =>
  p.name.trim().length > 0 && p.city.trim().length > 0 && p.products.length > 0;
