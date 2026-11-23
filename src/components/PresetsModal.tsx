import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Check, LayoutGrid, Trash2, X } from 'lucide-react';
import { CadSummaryText } from './CadIcons';
import { PRESETS } from '../core/constants';
import { fmtN } from '../core/geometry';
import type { PresetDef, SavedPreset } from '../core/types';
import { useFocusTrap } from '../utils/useFocusTrap';

interface PresetsModalProps {
  open: boolean;
  activeKey: string | null;
  savedPresets: SavedPreset[];
  currentOuterD: number;
  currentThick: number;
  onClose: () => void;
  onSelectPreset: (preset: PresetDef, key: string) => void;
  onSelectSaved: (saved: SavedPreset, index: number) => void;
  onSaveCurrent: (name: string) => void;
  onDeleteSaved: (index: number) => void;
}

export function PresetsModal({
  open,
  activeKey,
  savedPresets,
  currentOuterD,
  currentThick,
  onClose,
  onSelectPreset,
  onSelectSaved,
  onSaveCurrent,
  onDeleteSaved,
}: PresetsModalProps) {
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useFocusTrap(open, dialogRef);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on open; deferring would flash stale saving state
      setSaving(false);
      closeBtnRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (saving && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [saving]);

  if (!open) return null;

  const openSave = () => {
    setDraftName(`Мой Ø${Math.round(currentOuterD)}`);
    setSaving(true);
  };

  const commitSave = () => {
    const trimmed = draftName.trim() || `Мой Ø${Math.round(currentOuterD)}`;
    onSaveCurrent(trimmed);
    setSaving(false);
  };

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
        aria-labelledby="presets-modal-title"
        className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#cfd8e3] bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-[#f8fafc] px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#1e63c4] shadow-2xs">
              <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="presets-modal-title" className="text-[15px] font-bold leading-tight text-slate-900">
                Пресеты проставок
              </h2>
              <p className="mt-0.5 text-[11.5px] text-slate-500">
                Готовые типоразмеры автодинамиков и ваши сохранённые конфигурации
              </p>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно пресетов"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 p-5">
          {/* Built-in presets */}
          <div>
            <div className="mb-2 text-[11px] font-bold tracking-wider uppercase text-slate-400">
              Типовые размеры
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PRESETS.map((p, idx) => {
                const key = `builtin:${idx}`;
                const active = activeKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      onSelectPreset(p, key);
                      onClose();
                    }}
                    aria-pressed={active}
                    className={`flex flex-col items-start rounded-xl border px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[#1e63c4] bg-[#eaf1fb] shadow-[inset_0_-2px_0_#1e63c4]'
                        : 'border-slate-200 bg-white hover:border-[#1e63c4]/60 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className={`text-[13px] font-bold ${active ? 'text-[#154b96]' : 'text-slate-900'}`}>
                        {p.name}
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-[#1e63c4]" aria-hidden="true" />}
                    </div>
                    <span className="font-mono-num mt-0.5 inline-flex items-center text-[11px] text-slate-500">
                      <CadSummaryText text={p.meta} iconClassName="h-3.5 w-3.5 shrink-0 text-slate-600" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Saved presets */}
          <div className="border-t border-slate-100 pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
                Сохранённые виды ({savedPresets.length})
              </span>
              {!saving && (
                <button
                  type="button"
                  onClick={openSave}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#b6c3d1] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-slate-700 hover:border-[#1e63c4] hover:bg-[#eaf1fb]/60 hover:text-[#154b96] transition-colors cursor-pointer"
                >
                  <BookmarkPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Сохранить текущий вид</span>
                </button>
              )}
            </div>

            {saving && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitSave();
                }}
                className="mb-2.5 flex items-center gap-2 rounded-xl border border-[#1e63c4] bg-blue-50/30 p-2.5"
              >
                <input
                  ref={inputRef}
                  type="text"
                  maxLength={28}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setSaving(false);
                    }
                  }}
                  placeholder="Название пресета"
                  aria-label="Название пресета"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#1e63c4] focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#1e63c4] px-3 text-xs font-semibold text-white hover:bg-[#154b96] cursor-pointer whitespace-nowrap"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Сохранить</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSaving(false)}
                  aria-label="Отменить сохранение"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            )}

            {savedPresets.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {savedPresets.map((sp, idx) => {
                  const key = `saved:${idx}`;
                  const active = activeKey === key;
                  return (
                    <div
                      key={`${sp.name}-${idx}`}
                      className={`flex items-center justify-between rounded-xl border transition-colors ${
                        active
                          ? 'border-[#1e63c4] bg-[#eaf1fb]'
                          : 'border-slate-200 bg-white hover:border-[#1e63c4]/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSaved(sp, idx);
                          onClose();
                        }}
                        aria-pressed={active}
                        className="flex min-w-0 flex-1 flex-col items-start px-3.5 py-2.5 text-left cursor-pointer"
                      >
                        <span className="truncate w-full text-[13px] font-bold text-[#154b96]">
                          {sp.name}
                        </span>
                        <span className="font-mono-num mt-0.5 text-[11px] text-slate-500">
                          Ø{fmtN(sp.p.outerD || 180, 0)} × {fmtN(sp.p.thick || 16, 0)} мм
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSaved(idx)}
                        aria-label={`Удалить пресет «${sp.name}»`}
                        title={`Удалить пресет «${sp.name}»`}
                        className="mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              !saving && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-3 text-center text-xs text-slate-500">
                  Текущие размеры: Ø{fmtN(currentOuterD, 0)} × {fmtN(currentThick, 0)} мм — можно сохранить как собственный шаблон.
                </p>
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-slate-100 bg-[#f8fafc] px-5 py-3">
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
