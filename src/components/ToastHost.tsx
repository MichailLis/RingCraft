import type { ToastItem } from '../core/types';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

interface ToastHostProps {
  toasts: ToastItem[];
  drawerOpen?: boolean;
  onDismiss: (id: number) => void;
}

const BORDER_COLORS: Record<ToastItem['type'], string> = {
  info: 'border-slate-200',
  ok: 'border-emerald-200',
  warn: 'border-amber-200',
  err: 'border-red-200',
};

const ICON_MAP = {
  info: { Icon: Info, cls: 'text-[#1e63c4]' },
  ok: { Icon: CheckCircle2, cls: 'text-emerald-600' },
  warn: { Icon: AlertTriangle, cls: 'text-amber-600' },
  err: { Icon: AlertCircle, cls: 'text-red-600' },
} as const;

export function ToastHost({ toasts, drawerOpen = false, onDismiss }: ToastHostProps) {
  if (!toasts.length) return null;

  return (
    <div
      className={`fixed bottom-3 left-1/2 -translate-x-1/2 lg:left-9 lg:translate-x-0 z-30 flex flex-col gap-2 w-[min(360px,calc(100vw-24px))] lg:w-auto lg:max-w-[360px] pointer-events-none ${
        drawerOpen ? 'lg:bottom-auto lg:top-[122px]' : 'lg:bottom-[72px]'
      }`}
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const { Icon, cls } = ICON_MAP[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 rounded-lg bg-white px-3.5 py-2.5 text-[12.5px] font-medium text-slate-800 shadow-lg border ${BORDER_COLORS[t.type]}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${cls}`} aria-hidden="true" />
            <span className="flex-1 leading-snug">{t.msg}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.fn();
                  onDismiss(t.id);
                }}
                className="inline-flex min-h-6 items-center shrink-0 text-xs font-semibold text-[#1e63c4] hover:text-[#154b96] underline underline-offset-2 whitespace-nowrap cursor-pointer"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Закрыть уведомление"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
