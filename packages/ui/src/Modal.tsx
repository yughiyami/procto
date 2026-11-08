import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Native <dialog>-backed modal: showModal()/close() give us the top-layer,
 * backdrop, and Escape handling for free; we still own the focus trap and
 * focus restoration since <dialog> doesn't trap Tab by itself.
 */
export function Modal({ open, onClose, title, children, footer, size = 'md', className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const titleId = useRef(`izu-modal-title-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      triggerRef.current = document.activeElement;
      if (!dialog.open) dialog.showModal();
      document.body.style.overflow = 'hidden';
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    } else {
      if (dialog.open) dialog.close();
      document.body.style.overflow = '';
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Native `cancel` fires on Escape; keep it in sync with React state.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    // Clicking the ::backdrop dispatches a click on the dialog itself
    // (not on any of its children) — that's how we detect it.
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
      dialog.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={cx('izu-modal', `izu-modal--${size}`, className)}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="izu-modal__header">
        <h2 className="izu-modal__title" id={titleId}>
          {title}
        </h2>
        <button
          type="button"
          className="izu-modal__close"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <Icon name="x" size="sm" />
        </button>
      </div>
      <div className="izu-modal__body">{children}</div>
      {footer ? <div className="izu-modal__footer">{footer}</div> : null}
    </dialog>
  );
}
