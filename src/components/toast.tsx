import { X } from 'lucide-react';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

export interface Toast {
  id: number;
  message: ReactNode;
  tone?: 'default' | 'success' | 'error';
  action?: { label: string; run: () => void };
  duration?: number;
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: Omit<Toast, 'id'>) {
  const id = ++seq;
  toasts = [...toasts.slice(-3), { id, ...t }];
  emit();
  return id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function ToastItem({ t }: { t: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), t.duration ?? (t.action ? 6000 : 3500));
    return () => clearTimeout(timer);
  }, [t]);
  return (
    <div className={`toast toast-${t.tone ?? 'default'}`} role="status">
      <span className="toast-msg">{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            t.action!.run();
            dismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
        <X size={14} />
      </button>
    </div>
  );
}

export function Toaster() {
  const list = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => toasts,
  );
  return (
    <div className="toaster" aria-live="polite">
      {list.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
