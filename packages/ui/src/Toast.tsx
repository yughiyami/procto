import type { ReactNode } from 'react';
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export type ToastTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  title?: ReactNode;
  message: ReactNode;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. Defaults to 5000. */
  durationMs?: number;
}

interface ToastRecord extends Required<Omit<ToastOptions, 'title'>> {
  id: string;
  title?: ReactNode;
  remainingMs: number;
  startedAt: number;
  timer?: ReturnType<typeof setTimeout>;
}

interface ToastContextValue {
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const toastsRef = useRef<ToastRecord[]>([]);
  toastsRef.current = toasts;

  const dismiss = useCallback((id: string) => {
    setToasts((current) => {
      const found = current.find((toast) => toast.id === id);
      if (found?.timer) clearTimeout(found.timer);
      return current.filter((toast) => toast.id !== id);
    });
  }, []);

  const scheduleTimer = useCallback(
    (id: string, ms: number) => {
      const timer = setTimeout(() => dismiss(id), ms);
      setToasts((current) =>
        current.map((toast) =>
          toast.id === id ? { ...toast, timer, startedAt: Date.now(), remainingMs: ms } : toast,
        ),
      );
    },
    [dismiss],
  );

  const show = useCallback(
    (options: ToastOptions) => {
      const id = Math.random().toString(36).slice(2);
      const durationMs = options.durationMs ?? 5000;
      const record: ToastRecord = {
        id,
        title: options.title,
        message: options.message,
        tone: options.tone ?? 'neutral',
        durationMs,
        remainingMs: durationMs,
        startedAt: Date.now(),
      };
      setToasts((current) => {
        const next = [...current, record].slice(-MAX_VISIBLE);
        return next;
      });
      scheduleTimer(id, durationMs);
      return id;
    },
    [scheduleTimer],
  );

  const pause = useCallback((id: string) => {
    setToasts((current) =>
      current.map((toast) => {
        if (toast.id !== id) return toast;
        if (toast.timer) clearTimeout(toast.timer);
        const elapsed = Date.now() - toast.startedAt;
        return { ...toast, remainingMs: Math.max(toast.remainingMs - elapsed, 0), timer: undefined };
      }),
    );
  }, []);

  const resume = useCallback(
    (id: string) => {
      const toast = toastsRef.current.find((item) => item.id === id);
      if (!toast || toast.timer) return;
      scheduleTimer(id, toast.remainingMs || toast.durationMs);
    },
    [scheduleTimer],
  );

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext value={value}>
      {children}
      <div className="izu-toast-viewport" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx('izu-toast', `izu-toast--${toast.tone}`)}
            onMouseEnter={() => pause(toast.id)}
            onMouseLeave={() => resume(toast.id)}
          >
            <div className="izu-toast__body">
              {toast.title ? <strong>{toast.title}</strong> : null}
              <div>{toast.message}</div>
            </div>
            <button
              type="button"
              className="izu-toast__close"
              aria-label="Cerrar notificación"
              onClick={() => dismiss(toast.id)}
            >
              <Icon name="x" size="sm" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const context = use(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
