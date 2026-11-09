import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { TourOverlay } from './TourOverlay';
import { isTourDone, markTourDone } from './tourStorage';

type TourValue = {
  isOpen: boolean;
  /** Opens the tour from the first step (used by the "?" button and the landing). */
  start: () => void;
  /** Opens it only if the person never finished or skipped it. */
  startIfFirstVisit: () => void;
  close: () => void;
};

const Ctx = createContext<TourValue | undefined>(undefined);

export function TourProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);

  const start = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    markTourDone();
    setOpen(false);
  }, []);
  const startIfFirstVisit = useCallback(() => {
    if (!isTourDone()) setOpen(true);
  }, []);

  const value = useMemo(() => ({ isOpen, start, startIfFirstVisit, close }), [isOpen, start, startIfFirstVisit, close]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen && <TourOverlay onClose={close} />}
    </Ctx.Provider>
  );
}

export function useTour(): TourValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}

/** Opens the tour once, a moment after the screen has rendered, if this is the person's first visit. */
export function useAutoTour(delayMs = 900): void {
  const { startIfFirstVisit } = useTour();
  useEffect(() => {
    const timer = window.setTimeout(startIfFirstVisit, delayMs);
    return () => window.clearTimeout(timer);
  }, [startIfFirstVisit, delayMs]);
}
