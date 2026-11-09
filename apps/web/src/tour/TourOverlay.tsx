import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { placeCard } from './position';
import type { Placement, Rect } from './position';
import { TOUR_STEPS } from './steps';
import './tour.css';

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function findTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el && el.getClientRects().length > 0) return el;
  }
  return null;
}

const toRect = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

/**
 * In-house coachmark overlay. Keeps focus inside the card, closes with Escape, moves with the
 * arrow keys, announces each step to screen readers and falls back to a bottom sheet on phones.
 */
export function TourOverlay({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement>({ kind: 'center' });
  const cardRef = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[index]!;
  const last = index === TOUR_STEPS.length - 1;

  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(TOUR_STEPS.length - 1, next))), []);

  // Everything behind the overlay becomes inert while the tour is open (real focus trap for the page).
  useEffect(() => {
    const root = document.getElementById('root');
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root?.setAttribute('inert', '');
    return () => {
      root?.removeAttribute('inert');
      previous?.focus?.();
    };
  }, []);

  // Bring the highlighted element into view when the step changes.
  useEffect(() => {
    findTarget(step.targets)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [step]);

  const measure = useCallback(() => {
    const el = findTarget(step.targets);
    const rect = el ? toRect(el) : null;
    setTarget(rect);
    const card = cardRef.current?.getBoundingClientRect();
    setPlacement(
      placeCard(rect, { width: window.innerWidth, height: window.innerHeight }, { width: card?.width ?? 360, height: card?.height ?? 220 }),
    );
  }, [step]);

  useLayoutEffect(() => {
    measure();
    // Panels load asynchronously and smooth scrolling moves the target, so keep measuring while open.
    const timer = window.setInterval(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  // Focus the card whenever the step changes.
  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [index]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (last) onClose();
        else go(index + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === 'Tab') {
        const items = Array.from(cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
        if (items.length === 0) return;
        const first = items[0]!;
        const finalItem = items[items.length - 1]!;
        const active = document.activeElement;
        if (!cardRef.current?.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          finalItem.focus();
        } else if (!event.shiftKey && active === finalItem) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [index, last, go, onClose]);

  const PAD = 8;
  const spotlight = target && {
    top: target.top - PAD,
    left: target.left - PAD,
    width: target.width + PAD * 2,
    height: target.height + PAD * 2,
  };
  const cardStyle =
    placement.kind === 'below' || placement.kind === 'above' ? { top: placement.top, left: placement.left } : undefined;

  return createPortal(
    <div className="tour" data-placement={placement.kind}>
      {spotlight ? <div className="tour__spot" style={spotlight} aria-hidden="true" /> : <div className="tour__dim" aria-hidden="true" />}
      <div
        ref={cardRef}
        className="tour__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        style={cardStyle}
      >
        <p className="tour__count">
          Paso {index + 1} de {TOUR_STEPS.length}
        </p>
        <h2 id="tour-title" className="tour__title">
          {step.title}
        </h2>
        <p id="tour-body" className="tour__body">
          {step.body}
        </p>
        <div className="tour__dots" aria-hidden="true">
          {TOUR_STEPS.map((s, i) => (
            <span key={s.id} data-on={i === index || undefined} />
          ))}
        </div>
        <div className="tour__actions">
          <button type="button" className="tour__skip" onClick={onClose}>
            Omitir
          </button>
          <span className="tour__spacer" />
          {index > 0 && (
            <button type="button" className="tour__btn tour__btn--ghost" onClick={() => go(index - 1)}>
              Anterior
            </button>
          )}
          <button type="button" className="tour__btn" data-autofocus onClick={() => (last ? onClose() : go(index + 1))}>
            {last ? 'Entendido' : 'Siguiente'}
          </button>
        </div>
      </div>
      <div className="tour__sr" aria-live="polite" role="status">
        {`Paso ${index + 1} de ${TOUR_STEPS.length}: ${step.title}`}
      </div>
    </div>,
    document.body,
  );
}
