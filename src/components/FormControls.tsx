import { locale, t } from '../i18n';
import { useId, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, Minus, Plus, X } from 'lucide-react';
import type { ConstraintJumpTarget, ConstraintNotice } from '../core/constraints';
import { clamp } from '../core/geometry';

const JUMP_TARGET_LABELS: Record<ConstraintJumpTarget, string> = {
  ring: t('К размерам кольца'),
  door: t('К креплению к двери'),
  spk: t('К креплению динамика'),
};

interface ConstraintHintProps {
  notice?: ConstraintNotice | null;
  onJumpTarget?: (target: ConstraintJumpTarget) => void;
  onAutoFitHoles?: (notice: ConstraintNotice) => void;
  onDismiss?: () => void;
}

export function ConstraintHint({ notice, onJumpTarget, onAutoFitHoles, onDismiss }: ConstraintHintProps) {
  if (!notice) return null;
  const target = notice.blockingTarget ?? notice.blockingLayer;
  const showAutoFit = Boolean(notice.canAutoFitHoles && notice.attemptedPatch && onAutoFitHoles);
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-0.5 flex items-start gap-2 rounded-lg border border-amber-300/90 bg-amber-50/95 px-2.5 py-2 text-[11.5px] leading-snug text-amber-950"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{notice.reason}</p>
        {(showAutoFit || (target && onJumpTarget)) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {showAutoFit && (
              <button
                type="button"
                onClick={() => onAutoFitHoles!(notice)}
                className="inline-flex min-h-6 items-center gap-1 rounded-md border border-[#1e63c4]/40 bg-[#eaf1fb] px-2 py-0.5 text-[11px] font-semibold text-[#154b96] hover:bg-[#dce8f8] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45"
              >
                <span>{t('Подстроить отверстия')}</span>
              </button>
            )}
            {target && onJumpTarget && (
              <button
                type="button"
                onClick={() => onJumpTarget(target)}
                className="inline-flex min-h-6 items-center gap-1 rounded-md border border-amber-300/90 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100/70 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45"
              >
                <span>{JUMP_TARGET_LABELS[target]}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('Скрыть пояснение ограничения')}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-amber-800 hover:bg-amber-200/70 hover:text-amber-950 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  icon?: ReactNode;
  value: number;
  min: number;
  max: number;
  inputMin?: number;
  inputMax?: number;
  step: number;
  unit?: string;
  accent?: string;
  disabled?: boolean;
  constraint?: ConstraintNotice | null;
  hideConstraintHint?: boolean;
  onJumpTarget?: (target: ConstraintJumpTarget) => void;
  onAutoFitHoles?: (notice: ConstraintNotice) => void;
  onDismissConstraint?: () => void;
  onChange: (v: number) => void;
  onCommit?: () => void;
}

const formatNumInput = (v: number): string =>
  v.toLocaleString(locale, { maximumFractionDigits: 2, useGrouping: false });

export function SliderField({
  label,
  icon,
  value,
  min,
  max,
  inputMin,
  inputMax,
  step,
  unit = '',
  accent = '#33475c',
  disabled = false,
  constraint = null,
  hideConstraintHint = false,
  onJumpTarget,
  onAutoFitHoles,
  onDismissConstraint,
  onChange,
  onCommit,
}: SliderFieldProps) {
  const id = useId();
  const lo = inputMin ?? min;
  const hi = inputMax ?? max;
  const pct = clamp(((value - min) / Math.max(1e-6, max - min)) * 100, 0, 100);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commitDraft = () => {
    setEditing(false);
    const normalized = draft.trim().replace(',', '.');
    if (!normalized) return;
    const parsed = parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      const next = clamp(parsed, lo, hi);
      if (next !== value) {
        onChange(next);
      }
      onCommit?.();
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 ${disabled ? 'pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between gap-1.5">
        <label
          htmlFor={id}
          className={`inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap ${disabled ? 'text-slate-500' : 'text-slate-700'}`}
        >
          {icon}
          <span>{label}</span>
        </label>
        <div
          className={`inline-flex h-7 items-center gap-1 rounded-md border px-1.5 shrink-0 transition-colors ${
            disabled
              ? 'border-slate-200/80 bg-slate-100/80'
              : constraint
                ? 'border-amber-400 bg-amber-50/85 focus-within:border-amber-500 focus-within:bg-white'
                : 'border-slate-200 bg-slate-50 focus-within:border-[#1e63c4] focus-within:bg-white'
          }`}
        >
          <input
            type="text"
            inputMode="decimal"
            aria-label={t('{0}, число', label)}
            disabled={disabled}
            value={editing ? draft : formatNumInput(value)}
            onFocus={(e) => {
              setEditing(true);
              setDraft(formatNumInput(value));
              e.currentTarget.select();
            }}
            onChange={(e) => {
              setEditing(true);
              setDraft(e.target.value);
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
                setDraft(formatNumInput(value));
                e.currentTarget.blur();
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const delta = e.key === 'ArrowUp' ? step : -step;
                const next = clamp(+(value + delta).toFixed(2), lo, hi);
                setEditing(false);
                onChange(next);
              }
            }}
            className={`font-mono-num h-full w-11 bg-transparent text-right text-[12px] font-semibold focus:outline-none ${
              disabled ? 'text-slate-600' : 'text-slate-900'
            }`}
          />
          {unit && <span className="font-mono-num text-[10.5px] font-medium text-slate-600 select-none">{unit}</span>}
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={clamp(value, min, max)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={() => onCommit?.()}
        onKeyUp={() => onCommit?.()}
        style={
          {
            '--range-pct': `${pct}%`,
            '--range-accent': constraint ? '#d97706' : accent,
          } as React.CSSProperties
        }
        className={`cad-range ${disabled ? 'opacity-45' : ''}`}
      />
      {!hideConstraintHint && (
        <ConstraintHint
          notice={constraint}
          onJumpTarget={onJumpTarget}
          onAutoFitHoles={onAutoFitHoles}
          onDismiss={onDismissConstraint}
        />
      )}
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  hint?: string;
  checked: boolean;
  accent?: string;
  disabled?: boolean;
  constraint?: ConstraintNotice | null;
  onJumpTarget?: (target: ConstraintJumpTarget) => void;
  onDismissConstraint?: () => void;
  onChange: (checked: boolean) => void;
}

export function ToggleField({
  label,
  hint,
  checked,
  accent = '#33475c',
  disabled = false,
  constraint = null,
  onJumpTarget,
  onDismissConstraint,
  onChange,
}: ToggleFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 py-0.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className={`flex-1 select-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
          <span
            className={`block text-[12px] font-medium leading-snug ${disabled ? 'text-slate-500' : 'text-slate-700'}`}
          >
            {label}
          </span>
          {hint && <span className="block text-[11px] text-slate-600 leading-tight mt-0.5">{hint}</span>}
        </label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          style={{ backgroundColor: checked ? accent : '#cbd5e1' }}
          className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e63c4] ${
            disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'
          } ${constraint ? 'ring-2 ring-amber-400/80 ring-offset-1' : ''}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
              checked ? 'translate-x-4.5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      <ConstraintHint notice={constraint} onJumpTarget={onJumpTarget} onDismiss={onDismissConstraint} />
    </div>
  );
}

interface StepperFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  accent?: string;
  constraint?: ConstraintNotice | null;
  onJumpTarget?: (target: ConstraintJumpTarget) => void;
  onDismissConstraint?: () => void;
  onChange: (v: number) => void;
}

export function StepperField({
  label,
  value,
  min,
  max,
  accent = '#33475c',
  constraint = null,
  onJumpTarget,
  onDismissConstraint,
  onChange,
}: StepperFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-slate-700">{label}</span>
        <div
          className={`inline-flex items-center gap-1 rounded-lg border p-0.5 transition-colors ${
            constraint ? 'border-amber-400 bg-amber-50/75' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <button
            type="button"
            onClick={() => onChange(clamp(value - 1, min, max))}
            disabled={value <= min}
            aria-label={t('{0}: меньше', label)}
            className="inline-flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-md bg-white text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="font-mono-num min-w-7 text-center text-[13px] font-bold" style={{ color: accent }}>
            {value}
          </span>
          <button
            type="button"
            onClick={() => onChange(clamp(value + 1, min, max))}
            disabled={value >= max}
            aria-label={t('{0}: больше', label)}
            className="inline-flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-md bg-white text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ConstraintHint notice={constraint} onJumpTarget={onJumpTarget} onDismiss={onDismissConstraint} />
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  icon?: ReactNode;
  value: T;
  options: [T, string][];
  disabled?: boolean;
  constraint?: ConstraintNotice | null;
  onJumpTarget?: (target: ConstraintJumpTarget) => void;
  onDismissConstraint?: () => void;
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({
  label,
  icon,
  value,
  options,
  disabled = false,
  constraint = null,
  onJumpTarget,
  onDismissConstraint,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <label htmlFor={id} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
        {icon}
        <span>{label}</span>
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={`h-9 w-full rounded-lg border px-3 text-[12px] font-medium text-slate-800 shadow-2xs transition-colors focus:outline-none cursor-pointer ${
          constraint
            ? 'border-amber-400 bg-amber-50/60 focus:border-amber-500'
            : 'border-slate-200 bg-white hover:border-slate-300 focus:border-[#1e63c4]'
        }`}
      >
        {options.map(([val, text]) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
      </select>
      <ConstraintHint notice={constraint} onJumpTarget={onJumpTarget} onDismiss={onDismissConstraint} />
    </div>
  );
}
