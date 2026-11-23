import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { CounterboreIcon, CountersinkIcon, DiameterIcon } from './CadIcons';
import { fmtN } from '../core/geometry';
import type { AnalysisResult, DrawerTab, LayerKind } from '../core/types';

interface InspectionDrawerProps {
  tab: DrawerTab;
  analysis: AnalysisResult;
  onChangeTab: (tab: DrawerTab) => void;
  onFocusLayer: (layer: LayerKind) => void;
}

export function InspectionDrawer({ tab, analysis, onChangeTab, onFocusLayer }: InspectionDrawerProps) {
  if (!tab) return null;

  return (
    <div
      id="inspection-drawer"
      role="region"
      aria-label="Проверки и координаты отверстий"
      className="z-20 flex shrink-0 max-h-[230px] lg:max-h-[44%] flex-col border-t border-[#cfd8e3] bg-white"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 bg-slate-50/90">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">Контроль</span>
          <div className="flex items-center gap-1 rounded-md bg-slate-200/70 p-0.5" role="tablist" aria-label="Раздел контроля">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'checks'}
              onClick={() => onChangeTab('checks')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'checks' ? 'bg-white text-[#154b96] shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Проверки ({analysis.nErr ? `${analysis.nErr} ош.` : analysis.nWarn ? `${analysis.nWarn} зам.` : 'OK'})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'table'}
              onClick={() => onChangeTab('table')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'table' ? 'bg-white text-[#154b96] shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Отверстия ({analysis.holes.length})
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChangeTab(null)}
          aria-label="Закрыть панель контроля"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {tab === 'checks' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <ul className="space-y-2">
            {analysis.checks.map((c, idx) => {
              const Icon = c.lv === 'err' ? AlertCircle : c.lv === 'warn' ? AlertTriangle : CheckCircle2;
              const style =
                c.lv === 'err'
                  ? 'border-red-200 bg-red-50/70 text-red-900'
                  : c.lv === 'warn'
                    ? 'border-amber-200 bg-amber-50/70 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50/70 text-emerald-900';
              const iconColor =
                c.lv === 'err' ? 'text-red-600' : c.lv === 'warn' ? 'text-amber-600' : 'text-emerald-600';
              return (
                <li
                  key={idx}
                  className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-[12.5px] leading-snug ${style}`}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden="true" />
                    <span>{c.t}</span>
                  </div>
                  {c.layer && (
                    <button
                      type="button"
                      onClick={() => onFocusLayer(c.layer!)}
                      className="shrink-0 rounded border border-current/25 bg-white/80 px-2 py-0.5 text-[11px] font-semibold hover:bg-white cursor-pointer whitespace-nowrap"
                    >
                      {c.layer === 'door' ? 'К двери' : 'К динамику'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-100 bg-slate-50/60 px-3 py-1.5 font-mono-num text-[11px] text-slate-500">
            <span>Координаты X / Y от центра · мм</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <CounterboreIcon className="h-3.5 w-3.5 text-slate-600" />
              <span>цековка</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <CountersinkIcon className="h-3.5 w-3.5 text-slate-600" />
              <span>зенковка 90°</span>
            </span>
          </div>
          <table className="w-full border-collapse font-mono-num text-[12px]">
            <thead className="sticky top-0 bg-slate-100 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">№</th>
                <th className="px-3 py-2">Крепление</th>
                <th className="px-3 py-2 text-right">X</th>
                <th className="px-3 py-2 text-right">Y</th>
                <th className="px-3 py-2">Отверстие</th>
                <th className="px-3 py-2">Углубление</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analysis.holes.map((h) => {
                const isDoor = h.kind === 'door';
                return (
                  <tr
                    key={`${h.kind}-${h.idx}`}
                    className={h.valid ? 'hover:bg-slate-50/80' : 'bg-red-50/50 text-red-900'}
                  >
                    <td className="px-3 py-1.5 font-semibold text-slate-900 whitespace-nowrap">
                      {h.idx}
                      {!h.valid && (
                        <span
                          className="ml-1.5 text-[11px] font-bold text-red-600"
                          title={h.overlap ? 'Пересекается с другой группой отверстий' : 'Вне материала кольца'}
                        >
                          {h.overlap ? 'конфликт' : 'вне тела'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className={`font-sans text-xs font-medium ${isDoor ? 'text-[#154b96]' : 'text-[#b8431a]'}`}>
                        {isDoor ? 'К двери' : 'Динамик'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-700 whitespace-nowrap">{fmtN(h.cx)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-700 whitespace-nowrap">{fmtN(h.cy)}</td>
                    <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                      {h.type === 'slot' ? (
                        `паз ${fmtN(h.span, 0)}° × ${fmtN(h.w)}`
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <DiameterIcon className="h-3.5 w-3.5 text-slate-500" />
                          <span>{fmtN(h.r * 2)}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">
                      {h.cbDepth > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          {h.recessType === 'csk' ? (
                            <CountersinkIcon className="h-3.5 w-3.5 text-slate-600" />
                          ) : (
                            <CounterboreIcon className="h-3.5 w-3.5 text-slate-600" />
                          )}
                          <span>
                            {h.recessType === 'csk'
                              ? `${fmtN(h.cbR * 2)} × 90°`
                              : `${fmtN(h.cbR * 2)} × ${fmtN(h.cbDepth, 1)}`}
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
