import { AlertCircle, Download, LayoutGrid } from 'lucide-react';

interface HeaderBarProps {
  hasErrors: boolean;
  wizardActive?: boolean;
  onOpenPresets: () => void;
  onOpenExport: () => void;
}

export function HeaderBar({ hasErrors, wizardActive = false, onOpenPresets, onOpenExport }: HeaderBarProps) {
  return (
    <header className="relative z-30 flex h-13 shrink-0 items-center justify-between gap-2 sm:gap-4 border-b border-[#cfd8e3] bg-[#f8fafc] px-2.5 sm:px-4 lg:px-6">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <svg
          className="h-7 w-7 shrink-0 text-slate-900 transition-transform duration-300 hover:rotate-90"
          viewBox="0 0 40 40"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="20" cy="20" r="16.5" stroke="#16202b" strokeWidth="2.2" />
          <circle cx="20" cy="20" r="8.5" stroke="#64748b" strokeWidth="1.6" />
          <path d="M20 1.5v4M20 34.5v4M1.5 20h4M34.5 20h4" stroke="#64748b" strokeWidth="1.2" />
          <circle cx="20" cy="6.6" r="2" fill="#1e63c4" />
          <circle cx="8.4" cy="26.7" r="2" fill="#1e63c4" />
          <circle cx="31.6" cy="26.7" r="2" fill="#1e63c4" />
          <circle cx="26.1" cy="13.9" r="1.5" fill="#d9541e" />
          <circle cx="13.9" cy="13.9" r="1.5" fill="#d9541e" />
          <circle cx="13.9" cy="26.1" r="1.5" fill="#d9541e" />
          <circle cx="26.1" cy="26.1" r="1.5" fill="#d9541e" />
        </svg>
        <span className="text-[13.5px] sm:text-[15px] font-bold tracking-[0.09em] sm:tracking-[0.14em] text-[#16202b] whitespace-nowrap shrink-0">
          RingCraft
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenPresets}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#cfd8e3] bg-white px-2.5 sm:px-3 text-xs font-semibold text-slate-700 shadow-2xs hover:border-[#1e63c4] hover:text-[#154b96] transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45"
        >
          <LayoutGrid className="h-4 w-4 shrink-0 text-[#1e63c4]" aria-hidden="true" />
          <span>Пресеты</span>
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          title={hasErrors ? 'Экспорт (STL заблокирован: есть ошибки геометрии)' : undefined}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 sm:px-3.5 text-xs transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/50 focus-visible:ring-offset-1 ${
            wizardActive
              ? hasErrors
                ? 'border border-red-300 bg-red-50 font-semibold text-red-900 shadow-2xs hover:bg-red-100'
                : 'border border-[#cfd8e3] bg-white font-semibold text-slate-700 shadow-2xs hover:border-[#1e63c4] hover:text-[#154b96]'
              : 'bg-[#1e63c4] font-bold text-white shadow-xs hover:bg-[#154b96]'
          }`}
        >
          <Download
            className={`h-4 w-4 shrink-0 ${wizardActive ? (hasErrors ? 'text-red-700' : 'text-[#1e63c4]') : ''}`}
            aria-hidden="true"
          />
          <span>Экспорт</span>
          {hasErrors && (
            <>
              {wizardActive ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
              ) : (
                <span
                  className="ml-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-white text-red-700"
                  aria-hidden="true"
                >
                  <AlertCircle className="h-3.5 w-3.5 stroke-[2.4]" />
                </span>
              )}
              <span className="sr-only"> — есть ошибки геометрии, экспорт STL заблокирован</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
