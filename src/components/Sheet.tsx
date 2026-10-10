import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

let openCount = 0;
/** Open panels, newest last: only the top one reacts to keys. */
const stack: HTMLElement[] = [];

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
    const node = panel.current;
    if (node) stack.push(node);
    const focusFirst = () => {
      // A disabled autofocus target (e.g. "+1" on a finished show) can't take focus: use the panel.
      const el = node?.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)') ?? node;
      el?.focus({ preventScroll: true });
    };
    requestAnimationFrame(focusFirst);
    // Listen on the document: focus can leave the panel (a focused button unmounts), and keys
    // must still close the dialog and keep Tab inside it.
    const onKey = (e: KeyboardEvent) => {
      if (!node || stack[stack.length - 1] !== node) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [
        ...node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el !== node);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && node.contains(active) && active !== node;
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const i = node ? stack.lastIndexOf(node) : -1;
      if (i >= 0) stack.splice(i, 1);
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
