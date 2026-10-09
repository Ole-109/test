import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

let openCount = 0;

/**
 * Accessible modal surface. `drawer` slides in from the right on desktop;
 * `dialog` is centered. Both become bottom sheets on small screens.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  variant = 'dialog',
  hero,
  closeLabel = 'Close',
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'dialog' | 'drawer';
  hero?: ReactNode;
  closeLabel?: string;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    openCount++;
    document.body.classList.add('no-scroll');
    const focusFirst = () => {
      const el = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current;
      el?.focus({ preventScroll: true });
    };
    requestAnimationFrame(focusFirst);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.current?.addEventListener('keydown', onKey);
    const node = panel.current;
    return () => {
      node?.removeEventListener('keydown', onKey);
      openCount--;
      if (openCount === 0) document.body.classList.remove('no-scroll');
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={`sheet-root sheet-${variant}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={panel}
        className={`sheet-panel ${wide ? 'is-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {hero}
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label={closeLabel} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
