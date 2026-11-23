import { useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileCode2, Box, FileImage, Layers, X } from 'lucide-react';
import { CadSummaryText } from './CadIcons';
import { buildFileBase, fmtN, layerDesc } from '../core/geometry';
import type { AnalysisResult, SpacerState } from '../core/types';
import { useFocusTrap } from '../utils/useFocusTrap';

interface ExportModalProps {
  open: boolean;
  state: SpacerState;
  analysis: AnalysisResult;
  ready3d: boolean;
  onClose: () => void;
  onShowChecks: () => void;
  onExportDXF: () => void;
  onExportSTL: () => void;
  onExportSVG: () => void;
  onExportPNG: () => void;
}

export function ExportModal({
  open,
  state,
  analysis,
  ready3d,
  onClose,
  onShowChecks,
  onExportDXF,
  onExportSTL,
  onExportSVG,
  onExportPNG,
}: ExportModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(open, dialogRef);

  useEffect(() => {
    if (open) {
      closeBtnRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const cbCount = analysis.holes.filter((h) => h.valid && h.cbDepth > 0 && h.recessType === 'cb').length;
  const cskCount = analysis.holes.filter((h) => h.valid && h.cbDepth > 0 && h.recessType === 'csk').length;
  const contourCount =
    1 + (analysis.cutValid ? 1 : 0) + analysis.holes.filter((h) => h.valid).length + cbCount + cskCount;
  const fileBase = buildFileBase(state);
  const stlDisabled = analysis.nErr > 0;
  const pngDisabled = state.view === '3d' && !ready3d;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#cfd8e3] bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-[#f8fafc] px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#1e63c4] shadow-2xs">
              <Download className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="export-modal-title" className="text-[15px] font-bold leading-tight text-slate-900">
                Экспорт файлов проставки
              </h2>
              <p className="font-mono-num mt-0.5 truncate text-[11.5px] text-slate-500">
                Ø{fmtN(state.outerD, 0)}/{fmtN(state.innerD, 0)} × {fmtN(state.thick, 0)} мм · {fileBase}
              </p>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно экспорта"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {/* Geometry status banner */}
          {analysis.nErr > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <div>
                  <div className="font-bold">Ошибки геометрии ({analysis.nErr})</div>
                  <div className="text-[11.5px] text-red-800">
                    Экспорт STL заблокирован до исправления. DXF и SVG доступны.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onShowChecks();
                }}
                className="shrink-0 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-800 hover:bg-red-100/60 cursor-pointer whitespace-nowrap"
              >
                К проверкам
              </button>
            </div>
          ) : analysis.nWarn > 0 ? (
            (() => {
              const firstWarn = analysis.checks.find((c) => c.lv === 'warn');
              return (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950">
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                    <span className="leading-snug">
                      {analysis.nWarn === 1 && firstWarn
                        ? firstWarn.t
                        : `Замечания (${analysis.nWarn}): ${firstWarn?.short ?? firstWarn?.t ?? 'проверьте геометрию'}.`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onShowChecks();
                    }}
                    className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100/60 cursor-pointer whitespace-nowrap"
                  >
                    Проверить
                  </button>
                </div>
              );
            })()
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-2 text-xs text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="flex flex-wrap items-center gap-x-1">
                <span>Готово · Дверь:</span>
                <CadSummaryText text={layerDesc(state, 'door')} iconClassName="h-3.5 w-3.5 text-emerald-800" />
                <span>· Динамик:</span>
                <CadSummaryText text={layerDesc(state, 'spk')} iconClassName="h-3.5 w-3.5 text-emerald-800" />
              </span>
            </div>
          )}

          {/* Export format grid */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={onExportDXF}
              className="group flex flex-col justify-start gap-1.5 rounded-xl border border-[#1e63c4] bg-[#1e63c4] p-3.5 text-left text-white shadow-xs hover:bg-[#154b96] transition-colors cursor-pointer"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-bold">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                  DXF R12
                </span>
                <Download
                  className="h-4 w-4 opacity-90 transition-transform group-hover:translate-y-0.5"
                  aria-hidden="true"
                />
              </div>
              <p className="text-[11.5px] leading-snug text-blue-100">
                Раскрой для ЧПУ и лазера · контур, вырез, дверь, динамик{cbCount ? ', цековка' : ''}
                {cskCount ? ', зенковка' : ''} ({contourCount})
              </p>
            </button>

            <button
              type="button"
              onClick={onExportSTL}
              disabled={stlDisabled}
              className="group flex flex-col justify-start gap-1.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left text-slate-900 hover:border-[#1e63c4] hover:bg-blue-50/30 disabled:border-red-200 disabled:bg-red-50/40 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-bold">
                  <Box className={`h-4 w-4 ${stlDisabled ? 'text-red-500' : 'text-[#1e63c4]'}`} aria-hidden="true" />
                  STL (мм)
                </span>
                {analysis.nErr > 0 ? (
                  <span className="font-mono-num text-[10.5px] font-semibold text-red-700">заблокирован</span>
                ) : (
                  <Download
                    className="h-4 w-4 text-slate-500 group-hover:text-[#1e63c4] transition-transform group-hover:translate-y-0.5"
                    aria-hidden="true"
                  />
                )}
              </div>
              <p className="text-[11.5px] leading-snug text-slate-600">
                {analysis.nErr > 0
                  ? 'Исправьте конфликты геометрии для построения 3D-сетки'
                  : 'Бинарная 3D-модель с цековками и зенковками для 3D-печати'}
              </p>
            </button>

            <button
              type="button"
              onClick={onExportSVG}
              className="group flex flex-col justify-start gap-1.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left text-slate-900 hover:border-[#1e63c4] hover:bg-blue-50/30 transition-colors cursor-pointer"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-bold">
                  <FileCode2 className="h-4 w-4 text-[#1e63c4]" aria-hidden="true" />
                  SVG 1:1
                </span>
                <Download
                  className="h-4 w-4 text-slate-500 group-hover:text-[#1e63c4] transition-transform group-hover:translate-y-0.5"
                  aria-hidden="true"
                />
              </div>
              <p className="text-[11.5px] leading-snug text-slate-600">
                Векторный чертёж с выносными размерами и штампом детали
              </p>
            </button>

            <button
              type="button"
              onClick={onExportPNG}
              disabled={pngDisabled}
              className="group flex flex-col justify-start gap-1.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left text-slate-900 hover:border-[#1e63c4] hover:bg-blue-50/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-bold">
                  <FileImage className="h-4 w-4 text-[#1e63c4]" aria-hidden="true" />
                  PNG · {state.view === '2d' ? '2D' : '3D'}
                </span>
                <Download
                  className="h-4 w-4 text-slate-500 group-hover:text-[#1e63c4] transition-transform group-hover:translate-y-0.5"
                  aria-hidden="true"
                />
              </div>
              <p className="text-[11.5px] leading-snug text-slate-600">
                {state.view === '2d'
                  ? 'Растровый снимок текущего 2D-чертежа (1400×1400)'
                  : 'Растровый снимок текущего 3D-ракурса сцены'}
              </p>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-[#f8fafc] px-5 py-3">
          <span className="font-mono-num text-[11px] text-slate-500">Все размеры в миллиметрах · масштаб 1:1</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
