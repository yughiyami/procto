import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, ProctoMark } from '@izumi/ui';
import { ResetDemoButton } from '../../components/ResetDemoButton';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { createDemoDeps } from '../../demo/realDeps';
import { runDemo } from '../../demo/runDemo';
import type { StepEvent } from '../../demo/runDemo';
import { DEMO_STEPS, landingPath, parseDemoRole } from '../../demo/scenario';
import type { StepId } from '../../demo/scenario';
import { useSession } from '../../session/SessionContext';
import { friendlyError } from '../../stellar/errors';
import { markTourDone } from '../../tour/tourStorage';
import { DemoThreads } from './DemoThreads';
import './DemoPage.css';

type StepView = { status: 'pending' | 'active' | 'done' | 'error'; done?: number; total?: number; retry?: number };
const INITIAL: Record<StepId, StepView> = {
  wallets: { status: 'pending' },
  accounts: { status: 'pending' },
  funds: { status: 'pending' },
  order: { status: 'pending' },
};

/** Fraction of the whole preparation that is finished (each step weighs the same). */
function overallProgress(steps: Record<StepId, StepView>): number {
  return (
    DEMO_STEPS.reduce((sum, { id }) => {
      const s = steps[id];
      if (s.status === 'done') return sum + 1;
      if (s.status === 'active' && s.total) return sum + (s.done ?? 0) / s.total;
      return sum;
    }, 0) / DEMO_STEPS.length
  );
}

/** /demo: one tap prepares accounts, demo money and the sample order, then opens "Cobro protegido". */
export default function DemoPage() {
  useDocumentTitle('Preparando tu demo');
  const { search, key: locationKey } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSession();
  const [steps, setSteps] = useState<Record<StepId, StepView>>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const running = useRef(false);
  // Keep the latest session helpers without re-running the effect when session state changes.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const onEvent = useCallback((event: StepEvent) => {
    setSteps((prev) => {
      const current = prev[event.step];
      switch (event.status) {
        case 'active':
          return { ...prev, [event.step]: { status: 'active' } };
        case 'done':
          return { ...prev, [event.step]: { ...current, status: 'done' } };
        case 'progress':
          return { ...prev, [event.step]: { ...current, done: event.done, total: event.total } };
        case 'retrying':
          return { ...prev, [event.step]: { ...current, retry: event.retry } };
        case 'error':
          return { ...prev, [event.step]: { ...current, status: 'error' } };
      }
    });
  }, []);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    setFinished(false);
    setSteps(INITIAL);
    const params = new URLSearchParams(search);
    const role = parseDemoRole(search);
    try {
      const result = await runDemo(createDemoDeps((slot) => sessionRef.current.ensureQuickSlot(slot)), onEvent);
      if (params.get('tour') === '0') markTourDone();
      const s = sessionRef.current;
      s.setRole(role);
      if (role === 'proveedor') s.setWorkshopId(result.wallets.find((w) => w.workshopId)?.workshopId ?? null);
      await queryClient.invalidateQueries();
      setFinished(true);
      window.setTimeout(() => navigate(landingPath(result.orderId), { replace: true }), 900);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      running.current = false;
    }
  }, [search, onEvent, navigate, queryClient]);

  useEffect(() => {
    void start();
    // Runs once per visit (a new location key means a deliberate restart); "Reintentar" calls start() again.
  }, [start, locationKey]);

  const activeIndex = Math.max(
    0,
    DEMO_STEPS.findIndex((s) => steps[s.id].status === 'active' || steps[s.id].status === 'error'),
  );
  const activeStep = DEMO_STEPS[activeIndex]!;
  const progress = finished ? 1 : overallProgress(steps);
  const heading = error ? 'No pudimos terminar de preparar la demo' : finished ? 'Tu demo está lista' : 'Preparando tu demo…';
  const now = error ? '' : finished ? 'Abriendo el cobro protegido' : `${activeIndex + 1}/${DEMO_STEPS.length} ${activeStep.label}`;

  return (
    <main className="demo">
      <div className="demo__card">
        <Link to="/" className="demo__brand" aria-label="PROCTO, inicio">
          <ProctoMark size={28} />
          <span>PROCTO</span>
        </Link>

        <DemoThreads progress={progress} failed={Boolean(error)} />

        <h1 className="demo__title">{heading}</h1>
        <p className="demo__now" role="status" aria-live="polite">
          {now}
        </p>
        <div
          className="demo__bar"
          role="progressbar"
          aria-label="Avance de la preparación"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>

        <ol className="demo__steps">
          {DEMO_STEPS.map((step) => {
            const view = steps[step.id];
            return (
              <li key={step.id} data-status={view.status}>
                <span className="demo__glyph" aria-hidden="true" />
                <div>
                  <strong>
                    {step.label}
                    {view.status === 'active' && view.total ? ` (${view.done ?? 0}/${view.total})` : ''}
                  </strong>
                  <small>
                    {view.status === 'active' && view.retry
                      ? 'La red de pruebas tarda un poco. Reintentando…'
                      : view.status === 'done'
                        ? 'Listo'
                        : step.hint}
                  </small>
                </div>
              </li>
            );
          })}
        </ol>

        {error ? (
          <div className="demo__error" role="alert">
            <p>{error}</p>
            <p>No perdiste nada: lo que ya estaba listo se reutiliza al reintentar.</p>
            <div className="demo__actions">
              <Button onClick={() => void start()}>Reintentar</Button>
              <ResetDemoButton className="demo__link" />
            </div>
          </div>
        ) : (
          <p className="demo__note">
            Es una red de pruebas: el dinero de esta demo no tiene valor real. No necesitas instalar ni comprar nada.
          </p>
        )}
      </div>
    </main>
  );
}
