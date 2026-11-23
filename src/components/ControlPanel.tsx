import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Crosshair,
  Download,
  FileCode2,
  Layers,
  RotateCcw,
} from 'lucide-react';
import {
  BG_OPTS,
  BOLTS,
  BOLT_OPTS,
  CUSTOM_RECESS_OPTS,
  QUALITY_OPTS,
  RECESS_OPTS,
  STD_RANGES,
  WIDE_RANGES,
  isOutsideStdRange,
} from '../core/constants';
import {
  areLayerCountsCompatible,
  fastFor,
  fmtN,
  isDoorAutoShifted,
  isLayerRotationOptimal,
  layerTabDesc,
  minActualCrossLayerGapDeg,
  optimalLayerPairRotations,
  ringCenterBCD,
} from '../core/geometry';
import {
  QUICK_SIZES,
  WIZARD_STEPS,
  clampWizardStep,
  detectQuickSizeId,
  nextWizardStep,
  prevWizardStep,
} from '../core/wizard';
import type {
  AnalysisResult,
  BoltSize,
  LayerKind,
  QualityMode,
  RecessMode,
  SceneBgMode,
  SectionId,
  SpacerState,
  UIState,
} from '../core/types';
import type { ConstrainedField, ConstraintJumpTarget, ConstraintNotice } from '../core/constraints';
import {
  BcdDiameterIcon,
  CadSummaryText,
  CounterboreIcon,
  CountersinkIcon,
  DiameterIcon,
  DoorBoltLayerIcon,
  InnerCutoutIcon,
  OuterDiameterIcon,
  RingDimensionsIcon,
  SceneCubeIcon,
  SpeakerLayerIcon,
  ThicknessIcon,
  WizardStepsIcon,
} from './CadIcons';
import { ConstraintHint, SelectField, SliderField, StepperField, ToggleField } from './FormControls';

interface ControlPanelProps {
  state: SpacerState;
  analysis: AnalysisResult;
  ui: UIState;
  ready3d: boolean;
  constraint: ConstraintNotice | null;
  autoFitHolesActive: boolean;
  onPatch: (patch: Partial<SpacerState>, field?: ConstrainedField) => void;
  onSelectQuickSize: (patch: Partial<SpacerState>) => void;
  onToggleCustomRange: (wide: boolean) => void;
  onAutoFitHoles: (notice: ConstraintNotice) => void;
  onDismissConstraint: () => void;
  onFocusTarget: (target: ConstraintJumpTarget) => void;
  onToggleAccordion: (id: SectionId) => void;
  onToggleAll: (open: boolean) => void;
  onCopyLayer: (from: LayerKind) => void;
  onReset: () => void;
  onWizardStepChange: (step: number) => void;
  onFinishWizard: () => void;
  onSkipWizard: () => void;
  onStartWizard: () => void;
  onOpenPresets: () => void;
  onOpenExport: () => void;
  onExportSTL: () => void;
  onExportDXF: () => void;
  onExportSVG: () => void;
  onOpenChecks: () => void;
}

const Q_LABELS: Record<QualityMode, string> = {
  draft: 'Черновик',
  std: 'Стандарт',
  high: 'Высокое',
};

interface CollapsibleCardProps {
  id: string;
  headingId: string;
  title: string;
  summary: ReactNode;
  summaryColor?: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function CollapsibleCard({
  id,
  headingId,
  title,
  summary,
  summaryColor = '#64748b',
  icon,
  open,
  onToggle,
  children,
}: CollapsibleCardProps) {
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <button
        id={headingId}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50/90 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1e63c4]/45"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span className="text-[12px] font-bold tracking-wide uppercase text-slate-800 truncate">{title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="inline-flex items-center gap-1 font-mono-num text-[11px] font-medium whitespace-nowrap"
            style={{ color: summaryColor }}
          >
            {summary}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
            aria-hidden="true"
          />
        </div>
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </section>
  );
}

interface LayerCardBodyProps {
  layer: LayerKind;
  state: SpacerState;
  wideRange: boolean;
  constraint: ConstraintNotice | null;
  onPatch: (patch: Partial<SpacerState>, field?: ConstrainedField) => void;
  onDismissConstraint: () => void;
  onFocusTarget: (target: ConstraintJumpTarget) => void;
  onCopyLayer: (from: LayerKind) => void;
}

function LayerCardBody({
  layer,
  state,
  wideRange,
  constraint,
  onPatch,
  onDismissConstraint,
  onFocusTarget,
  onCopyLayer,
}: LayerCardBodyProps) {
  const isDoor = layer === 'door';
  const accent = isDoor ? '#1e63c4' : '#d9541e';
  const accentDark = isDoor ? '#154b96' : '#b8431a';
  const accentBg = isDoor ? 'bg-[#eaf1fb]/70' : 'bg-[#fdeee6]/70';

  const boltKey = isDoor ? 'doorBolt' : 'spkBolt';
  const bcdKey = isDoor ? 'doorBCD' : 'spkBCD';
  const nKey = isDoor ? 'doorN' : 'spkN';
  const holeDKey = isDoor ? 'doorHoleD' : 'spkHoleD';
  const rotKey = isDoor ? 'doorRot' : 'spkRot';
  const slotsKey = isDoor ? 'doorSlots' : 'spkSlots';
  const slotAngKey = isDoor ? 'slotAngle' : 'spkSlotAngle';
  const recessKey = isDoor ? 'doorRecess' : 'spkRecess';
  const headClearKey = isDoor ? 'doorHeadClear' : 'spkHeadClear';

  const boltVal = state[boltKey];
  const slotsVal = state[slotsKey];
  const recessVal = state[recessKey];
  const fa = fastFor(state, layer);
  const boltSpec = boltVal !== 'custom' ? BOLTS[boltVal] : null;

  const cbClamped = fa.active && fa.actualCbDepth < fa.cbDepth - 1e-3;
  const floorMm = Math.max(0, state.thick - fa.actualCbDepth);
  const noticeFor = (field: ConstrainedField) => (constraint?.field === field ? constraint : null);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1.5">
        <div className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ${accentBg}`}>
          <span className="text-[11px] font-medium text-slate-600 truncate">
            {isDoor ? 'Крепление проставки к металлу двери' : 'Крепление корзины динамика к проставке'}
          </span>
          <button
            type="button"
            onClick={() => onCopyLayer(layer)}
            title={`Скопировать параметры крепежа на ${isDoor ? 'динамик' : 'дверь'}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900 cursor-pointer whitespace-nowrap"
          >
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{isDoor ? 'На динамик' : 'На дверь'}</span>
          </button>
        </div>
        <ConstraintHint notice={noticeFor('copyLayer')} onJumpTarget={onFocusTarget} onDismiss={onDismissConstraint} />
      </div>

      <SelectField<BoltSize>
        label="Тип крепежа"
        value={boltVal}
        options={BOLT_OPTS}
        constraint={noticeFor(boltKey)}
        onJumpTarget={onFocusTarget}
        onDismissConstraint={onDismissConstraint}
        onChange={(val) => {
          const patch: Partial<SpacerState> = { [boltKey]: val };
          if (val !== 'custom') {
            patch[holeDKey] = BOLTS[val].clear;
          } else if (recessVal === 'flush' || recessVal === 'deep') {
            patch[recessKey] = 'none';
          }
          onPatch(patch, boltKey);
        }}
      />

      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-2.5 py-1.5 font-mono-num text-[10.5px] leading-snug text-slate-700">
        {boltSpec ? (
          <>
            <strong style={{ color: accentDark }}>Болт {boltVal}</strong>
            <span>· отв.</span>
            <strong style={{ color: accentDark }}>Ø{fmtN(boltSpec.clear)}</strong>
            {fa.active ? (
              fa.recessType === 'csk' ? (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5" title="Зенковка 90°">
                    <CountersinkIcon className="h-3.5 w-3.5 text-slate-600" />
                    <span>{fmtN(fa.cbD)}×90°</span>
                  </span>
                  <span>(глуб. {fmtN(fa.actualCbDepth, 1)})</span>
                  {cbClamped ? (
                    <span className="font-semibold text-red-700">
                      · подрезано с {fmtN(fa.cbDepth, 1)} · дно {fmtN(floorMm, 1)}
                      {'\u00A0'}мм
                    </span>
                  ) : (
                    <span>
                      · дно {fmtN(floorMm, 1)}
                      {'\u00A0'}мм
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5" title="Цековка">
                    <CounterboreIcon className="h-3.5 w-3.5 text-slate-600" />
                    <span>
                      {fmtN(fa.cbD)}×{fmtN(fa.actualCbDepth, 1)}
                    </span>
                  </span>
                  {cbClamped ? (
                    <span className="font-semibold text-red-700">
                      · подрезано с {fmtN(fa.cbDepth, 0)} · дно {fmtN(floorMm, 1)}
                      {'\u00A0'}мм
                    </span>
                  ) : (
                    <span>
                      · дно {fmtN(floorMm, 1)}
                      {'\u00A0'}мм
                    </span>
                  )}
                </>
              )
            ) : (
              <span>
                · головка Ø{fmtN(boltSpec.dk)}×{fmtN(boltSpec.k, 0)} · снаружи
              </span>
            )}
          </>
        ) : fa.active && fa.recessType === 'csk' ? (
          <>
            <span>Отверстие</span>
            <strong style={{ color: accentDark }}>Ø{fmtN(state[holeDKey])}</strong>
            <span>·</span>
            <span className="inline-flex items-center gap-0.5" title="Зенковка 90°">
              <CountersinkIcon className="h-3.5 w-3.5 text-slate-600" />
              <span>{fmtN(fa.cbD)}×90°</span>
            </span>
            <span>
              (глуб. {fmtN(fa.actualCbDepth, 1)}) · дно {fmtN(floorMm, 1)}
              {'\u00A0'}мм
            </span>
          </>
        ) : (
          <span>Произвольный Ø отверстия · без углубления</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {(() => {
          const centeredBcd = ringCenterBCD(state);
          const isCentered = Math.abs(state[bcdKey] - centeredBcd) < 0.5;
          return (
            <div className="flex flex-col gap-1.5">
              <SliderField
                label="Окружность отверстий"
                icon={
                  <BcdDiameterIcon className={`h-4 w-4 shrink-0 ${isDoor ? 'text-[#1e63c4]' : 'text-[#d9541e]'}`} />
                }
                value={state[bcdKey]}
                min={(wideRange ? WIDE_RANGES : STD_RANGES)[bcdKey][0]}
                max={(wideRange ? WIDE_RANGES : STD_RANGES)[bcdKey][1]}
                inputMin={WIDE_RANGES[bcdKey][0]}
                inputMax={WIDE_RANGES[bcdKey][1]}
                step={1}
                unit="мм"
                accent={accent}
                constraint={noticeFor(bcdKey)}
                onJumpTarget={onFocusTarget}
                onDismissConstraint={onDismissConstraint}
                onChange={(v) => onPatch({ [bcdKey]: v }, bcdKey)}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-num text-[11px] text-slate-500">
                  Центр рамки: Ø{fmtN(centeredBcd, 0)} мм
                </span>
                <button
                  type="button"
                  disabled={isCentered}
                  onClick={() => onPatch({ [bcdKey]: centeredBcd }, bcdKey)}
                  title={`Поставить отверстия на Ø${fmtN(centeredBcd, 0)} мм — ровно посередине стенки кольца`}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                    isCentered
                      ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700 cursor-default'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-[#1e63c4] hover:bg-blue-50/50 hover:text-[#154b96] cursor-pointer'
                  }`}
                >
                  {isCentered ? (
                    <>
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>По центру рамки</span>
                    </>
                  ) : (
                    <>
                      <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>По центру рамки</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })()}

        <StepperField
          label={slotsVal ? 'Количество пазов' : 'Количество отверстий'}
          value={state[nKey]}
          min={2}
          max={8}
          accent={accentDark}
          constraint={noticeFor(nKey)}
          onJumpTarget={onFocusTarget}
          onDismissConstraint={onDismissConstraint}
          onChange={(v) => {
            const pair = optimalLayerPairRotations({ ...state, [nKey]: v }, layer);
            onPatch({ [nKey]: v, doorRot: pair.doorRot, spkRot: pair.spkRot }, nKey);
          }}
        />

        {(() => {
          const pair = optimalLayerPairRotations(state, layer);
          const optRot = isDoor ? pair.doorRot : pair.spkRot;
          const isBalanced = isLayerRotationOptimal(state, layer);
          const compatible = areLayerCountsCompatible(state.doorN, state.spkN);
          const autoShifted = isDoorAutoShifted(state);
          const minGap = minActualCrossLayerGapDeg(state);
          const otherLabel = isDoor ? 'динамика' : 'двери';
          const strictIncompatible = !compatible && !state.doorAutoSpace;
          const tightRigid = strictIncompatible && minGap < 14;
          const canEnableAutoShift = isDoor && strictIncompatible && isBalanced;

          const statusText = autoShifted
            ? isDoor
              ? `Отступ от динамика · мин. ${fmtN(minGap, 1)}°`
              : `Дверь обходит динамик · мин. ${fmtN(minGap, 1)}°`
            : strictIncompatible
              ? `Шаг ${fmtN(360 / state[nKey], 0)}° · мин. ${fmtN(minGap, 1)}°`
              : `Симметрия: ${fmtN(optRot, 1)}° · мин. ${fmtN(minGap, 1)}°`;

          const confirmedLabel = strictIncompatible ? 'Оптимально' : 'Симметрия';

          return (
            <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <SliderField
                  label={boltVal !== 'custom' ? 'Отв. под болт' : slotsVal ? 'Ширина паза' : 'Отверстие'}
                  value={state[holeDKey]}
                  min={2.5}
                  max={12}
                  step={0.1}
                  unit="мм"
                  accent={accent}
                  disabled={boltVal !== 'custom'}
                  constraint={noticeFor(holeDKey)}
                  hideConstraintHint
                  onChange={(v) => onPatch({ [holeDKey]: v }, holeDKey)}
                />
                <SliderField
                  label="Поворот группы"
                  value={state[rotKey]}
                  min={0}
                  max={359.5}
                  step={0.5}
                  unit="°"
                  accent={accent}
                  constraint={noticeFor(rotKey)}
                  hideConstraintHint
                  onChange={(v) => onPatch({ [rotKey]: v }, rotKey)}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono-num text-[11px] ${
                    tightRigid ? 'text-amber-700 font-medium' : 'text-slate-500'
                  }`}
                >
                  {statusText}
                </span>
                {canEnableAutoShift ? (
                  <button
                    type="button"
                    onClick={() => {
                      const nextPair = optimalLayerPairRotations({ ...state, doorAutoSpace: true }, layer);
                      onPatch(
                        { doorAutoSpace: true, doorRot: nextPair.doorRot, spkRot: nextPair.spkRot },
                        'doorAutoSpace'
                      );
                    }}
                    title="Включить автоматический обход отверстий динамика, чтобы развести близкие пары"
                    className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50/80 px-2 text-[11px] font-semibold text-amber-800 transition-colors hover:border-amber-400 hover:bg-amber-100/80 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/45"
                  >
                    <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Развести</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBalanced}
                    onClick={() => onPatch({ doorRot: pair.doorRot, spkRot: pair.spkRot }, rotKey)}
                    title={`Выставить симметричный поворот ${fmtN(optRot, 1)}° относительно отверстий ${otherLabel}`}
                    className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                      isBalanced
                        ? strictIncompatible
                          ? 'border-slate-200 bg-slate-50 text-slate-600 cursor-default'
                          : 'border-emerald-200 bg-emerald-50/80 text-emerald-700 cursor-default'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-[#1e63c4] hover:bg-blue-50/50 hover:text-[#154b96] cursor-pointer'
                    }`}
                  >
                    {isBalanced ? (
                      <>
                        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{confirmedLabel}</span>
                      </>
                    ) : (
                      <>
                        <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>Выровнять</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              {isDoor && (
                <div className="pt-1 border-t border-slate-100">
                  <ToggleField
                    label="Обходить отверстия динамика"
                    hint={
                      autoShifted
                        ? 'Сдвигает отверстия двери в свободные промежутки между крепежом динамика'
                        : 'При некратном количестве разводит отверстия двери и динамика'
                    }
                    checked={state.doorAutoSpace}
                    accent={accent}
                    onChange={(v) => onPatch({ doorAutoSpace: v }, 'doorAutoSpace')}
                  />
                </div>
              )}
              <ConstraintHint
                notice={noticeFor(holeDKey) ?? noticeFor(rotKey)}
                onJumpTarget={onFocusTarget}
                onDismiss={onDismissConstraint}
              />
            </div>
          );
        })()}
      </div>

      <div className="border-t border-slate-100 pt-2.5 flex flex-col gap-2.5">
        <ToggleField
          label="Дуговые пазы вместо отверстий"
          checked={slotsVal}
          accent={accent}
          constraint={noticeFor(slotsKey)}
          onJumpTarget={onFocusTarget}
          onDismissConstraint={onDismissConstraint}
          onChange={(v) => {
            onPatch({ [slotsKey]: v }, slotsKey);
          }}
        />
        {slotsVal && (
          <SliderField
            label="Угол раскрытия паза"
            value={state[slotAngKey]}
            min={6}
            max={40}
            step={1}
            unit="°"
            accent={accent}
            constraint={noticeFor(slotAngKey)}
            onJumpTarget={onFocusTarget}
            onDismissConstraint={onDismissConstraint}
            onChange={(v) => onPatch({ [slotAngKey]: v }, slotAngKey)}
          />
        )}
      </div>

      <div className="border-t border-slate-100 pt-2.5 flex flex-col gap-2.5">
        <SelectField<RecessMode>
          label="Углубление под головку"
          icon={
            fa.active ? (
              fa.recessType === 'csk' ? (
                <CountersinkIcon className={`h-4 w-4 shrink-0 ${isDoor ? 'text-[#1e63c4]' : 'text-[#d9541e]'}`} />
              ) : (
                <CounterboreIcon className={`h-4 w-4 shrink-0 ${isDoor ? 'text-[#1e63c4]' : 'text-[#d9541e]'}`} />
              )
            ) : undefined
          }
          value={recessVal}
          options={boltVal !== 'custom' ? RECESS_OPTS : CUSTOM_RECESS_OPTS}
          constraint={noticeFor(recessKey)}
          onJumpTarget={onFocusTarget}
          onDismissConstraint={onDismissConstraint}
          onChange={(v) => {
            onPatch({ [recessKey]: v }, recessKey);
          }}
        />
        {recessVal !== 'none' && (
          <SliderField
            label={fa.recessType === 'csk' ? 'Зазор зенковки' : 'Зазор вокруг головки'}
            icon={
              fa.recessType === 'csk' ? (
                <CountersinkIcon className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <CounterboreIcon className="h-4 w-4 shrink-0 text-slate-500" />
              )
            }
            value={state[headClearKey]}
            min={0.2}
            max={1.5}
            step={0.1}
            unit="мм"
            accent={accent}
            constraint={noticeFor(headClearKey)}
            onJumpTarget={onFocusTarget}
            onDismissConstraint={onDismissConstraint}
            onChange={(v) => onPatch({ [headClearKey]: v }, headClearKey)}
          />
        )}
      </div>

      {isDoor && (
        <div className="border-t border-slate-100 pt-2.5 flex flex-col gap-2.5">
          <ToggleField
            label="Монтажные ушки"
            hint="Расширяют внешний контур вокруг отверстий двери"
            checked={state.ears}
            accent={accent}
            constraint={noticeFor('ears')}
            onJumpTarget={onFocusTarget}
            onDismissConstraint={onDismissConstraint}
            onChange={(v) => {
              onPatch({ ears: v }, 'ears');
            }}
          />
          {state.ears && (
            <SliderField
              label="Вылет ушка (запас стенки)"
              value={state.earMargin}
              min={4}
              max={16}
              step={0.5}
              unit="мм"
              accent={accent}
              constraint={noticeFor('earMargin')}
              onJumpTarget={onFocusTarget}
              onDismissConstraint={onDismissConstraint}
              onChange={(v) => onPatch({ earMargin: v }, 'earMargin')}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface RingControlsBodyProps {
  state: SpacerState;
  analysis: AnalysisResult;
  wideRange: boolean;
  autoFitHolesActive: boolean;
  showRangeToggle: boolean;
  constraint: ConstraintNotice | null;
  onPatch: (patch: Partial<SpacerState>, field?: ConstrainedField) => void;
  onToggleCustomRange: (wide: boolean) => void;
  onAutoFitHoles: (notice: ConstraintNotice) => void;
  onDismissConstraint: () => void;
  onFocusTarget: (target: ConstraintJumpTarget) => void;
}

function RingControlsBody({
  state,
  analysis,
  wideRange,
  autoFitHolesActive,
  showRangeToggle,
  constraint,
  onPatch,
  onToggleCustomRange,
  onAutoFitHoles,
  onDismissConstraint,
  onFocusTarget,
}: RingControlsBodyProps) {
  const noticeFor = (field: ConstrainedField) => (constraint?.field === field ? constraint : null);
  const ranges = wideRange ? WIDE_RANGES : STD_RANGES;

  return (
    <div className="p-3 space-y-3">
      {showRangeToggle && (
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Диапазон шкалы</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => onToggleCustomRange(false)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                !wideRange ? 'bg-white text-[#154b96] shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              120–260
            </button>
            <button
              type="button"
              onClick={() => onToggleCustomRange(true)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                wideRange ? 'bg-white text-[#154b96] shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Произвольный
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <SliderField
          label="Внешний диаметр"
          icon={<OuterDiameterIcon />}
          value={state.outerD}
          min={ranges.outerD[0]}
          max={ranges.outerD[1]}
          inputMin={WIDE_RANGES.outerD[0]}
          inputMax={WIDE_RANGES.outerD[1]}
          step={1}
          unit="мм"
          constraint={noticeFor('outerD')}
          onJumpTarget={onFocusTarget}
          onAutoFitHoles={onAutoFitHoles}
          onDismissConstraint={onDismissConstraint}
          onChange={(v) => onPatch({ outerD: v }, 'outerD')}
        />
        <SliderField
          label="Внутренний вырез"
          icon={<InnerCutoutIcon />}
          value={state.innerD}
          min={ranges.innerD[0]}
          max={ranges.innerD[1]}
          inputMin={WIDE_RANGES.innerD[0]}
          inputMax={WIDE_RANGES.innerD[1]}
          step={1}
          unit="мм"
          constraint={noticeFor('innerD')}
          onJumpTarget={onFocusTarget}
          onAutoFitHoles={onAutoFitHoles}
          onDismissConstraint={onDismissConstraint}
          onChange={(v) => onPatch({ innerD: v }, 'innerD')}
        />
        <div className="flex flex-col gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11.5px] text-slate-600">
          <div className="flex items-center justify-between">
            <span className="font-medium">Ширина стенки кольца</span>
            <span className="font-mono-num text-[12px] font-semibold text-slate-800">
              {fmtN(Math.max(0, analysis.ringW))} мм
            </span>
          </div>
          {autoFitHolesActive && (
            <span className="text-[10.5px] leading-snug text-slate-500">
              Отверстия подстраиваются под кольцо · точная настройка на шагах 2–3
            </span>
          )}
        </div>
      </div>

      <div className="pt-2.5 border-t border-slate-100 flex flex-col gap-2.5">
        <SliderField
          label="Толщина проставки"
          icon={<ThicknessIcon />}
          value={state.thick}
          min={ranges.thick[0]}
          max={ranges.thick[1]}
          inputMin={WIDE_RANGES.thick[0]}
          inputMax={WIDE_RANGES.thick[1]}
          step={1}
          unit="мм"
          constraint={noticeFor('thick')}
          onJumpTarget={onFocusTarget}
          onAutoFitHoles={onAutoFitHoles}
          onDismissConstraint={onDismissConstraint}
          onChange={(v) => onPatch({ thick: v }, 'thick')}
        />
        <ToggleField
          label="Фаска по контуру 45°"
          hint="Снимает кромку 45° по внешнему и внутреннему контуру"
          checked={state.chamfer}
          onChange={(v) => {
            onPatch({ chamfer: v });
          }}
        />
      </div>
    </div>
  );
}

export function ControlPanel({
  state,
  analysis,
  ui,
  ready3d,
  constraint,
  autoFitHolesActive,
  onPatch,
  onSelectQuickSize,
  onToggleCustomRange,
  onAutoFitHoles,
  onDismissConstraint,
  onFocusTarget,
  onToggleAccordion,
  onToggleAll,
  onCopyLayer,
  onReset,
  onWizardStepChange,
  onFinishWizard,
  onSkipWizard,
  onStartWizard,
  onOpenPresets,
  onOpenExport,
  onExportSTL,
  onExportDXF,
  onExportSVG,
  onOpenChecks,
}: ControlPanelProps) {
  const anyOpen = Object.values(ui.open).some(Boolean);
  const wideRange = Boolean(ui.customRange) || isOutsideStdRange(state);
  const ringSummary = (
    <span className="inline-flex items-center gap-1">
      <DiameterIcon className="h-3.5 w-3.5 shrink-0" />
      <span>
        {fmtN(state.outerD, 0)}/{fmtN(state.innerD, 0)} · {fmtN(state.thick, 0)} мм
      </span>
    </span>
  );
  const doorSummary = <CadSummaryText text={`Ø${fmtN(state.doorBCD, 0)} · ${layerTabDesc(state, 'door')}`} />;
  const spkSummary = <CadSummaryText text={`Ø${fmtN(state.spkBCD, 0)} · ${layerTabDesc(state, 'spk')}`} />;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const stepIndex = clampWizardStep(ui.wizardStep);
  const currentStep = WIZARD_STEPS[stepIndex];
  const activeQuickSize = detectQuickSizeId(state);
  const isWizard = ui.mode === 'wizard';

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollDown(el.scrollHeight - el.clientHeight - el.scrollTop > 8);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    checkScroll,
    ui.mode,
    ui.wizardStep,
    ui.open,
    state.doorBolt,
    state.spkBolt,
    state.doorSlots,
    state.spkSlots,
    state.ears,
    state.autoRotate,
    constraint,
  ]);

  useEffect(() => {
    if (isWizard) {
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [isWizard, stepIndex]);

  const handleWizardNext = () => {
    const res = nextWizardStep(stepIndex);
    if (res.done) {
      onFinishWizard();
    } else {
      onWizardStepChange(res.step);
    }
  };

  const handleWizardPrev = () => {
    onWizardStepChange(prevWizardStep(stepIndex));
  };

  if (isWizard) {
    const stepIcon =
      currentStep.id === 'ring' ? (
        <RingDimensionsIcon className="h-[18px] w-[18px] text-slate-600 shrink-0" />
      ) : currentStep.id === 'door' ? (
        <DoorBoltLayerIcon className="h-[18px] w-[18px] text-[#1e63c4] shrink-0" />
      ) : currentStep.id === 'spk' ? (
        <SpeakerLayerIcon className="h-[18px] w-[18px] text-[#d9541e] shrink-0" />
      ) : (
        <Download className="h-[18px] w-[18px] text-[#1e63c4] shrink-0" aria-hidden="true" />
      );

    const hasIssue = analysis.nErr > 0 || analysis.nWarn > 0;

    return (
      <aside
        aria-label="Мастер создания модели"
        className="flex flex-col overflow-hidden rounded-xl border border-[#cfd8e3] bg-[#f8fafc] shadow-xs lg:min-h-0 lg:w-[404px] lg:shrink-0"
      >
        {/* Header aligned with viewport toolbar rail */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2.5 py-3">
          <div className="flex items-center gap-2 min-w-0 pl-0.5">
            <h2 className="text-[12px] font-bold tracking-wider uppercase text-slate-800 truncate">Мастер создания</h2>
            <span className="font-mono-num text-[11px] font-semibold text-[#154b96] shrink-0">
              {stepIndex + 1}/{WIZARD_STEPS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onSkipWizard}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 hover:border-[#1e63c4] hover:bg-blue-50/50 hover:text-[#154b96] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45"
          >
            Все параметры
          </button>
        </div>

        {/* Clickable 4-step progress rail */}
        <nav aria-label="Шаги мастера" className="shrink-0 border-b border-slate-200/80 bg-[#f8fafc] px-2.5 py-2">
          <ol className="grid grid-cols-4 gap-1.5">
            {WIZARD_STEPS.map((step, idx) => {
              const isActive = idx === stepIndex;
              const isDone = idx < stepIndex;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    aria-current={isActive ? 'step' : undefined}
                    onClick={() => onWizardStepChange(idx)}
                    className={`flex w-full flex-col sm:flex-row items-center justify-center gap-1 rounded-lg border px-1 sm:px-1.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                      isActive
                        ? 'border-[#1e63c4] bg-[#eaf1fb] text-[#154b96]'
                        : isDone
                          ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          : 'border-slate-200/80 bg-white/70 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-mono-num text-[10px] font-bold leading-none ${
                        isActive
                          ? 'bg-[#1e63c4] text-white'
                          : isDone
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200/90 text-slate-600'
                      }`}
                    >
                      {isDone ? <Check className="h-3 w-3 stroke-[2.75]" /> : idx + 1}
                    </span>
                    <span className="leading-tight text-center sm:truncate">{step.shortLabel}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Scrollable active step content */}
        <div className="relative flex flex-col lg:flex-1 lg:min-h-0">
          <div
            ref={scrollRef}
            onScroll={checkScroll}
            className="p-2.5 space-y-2.5 lg:flex-1 lg:min-h-0 lg:overflow-y-auto"
          >
            <section
              aria-labelledby={`wizard-heading-${currentStep.id}`}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <div className="border-b border-slate-100 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {stepIcon}
                  <h3
                    id={`wizard-heading-${currentStep.id}`}
                    className="text-[12px] font-bold tracking-wide uppercase text-slate-800"
                  >
                    {currentStep.title}
                  </h3>
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-slate-600">{currentStep.subtitle}</p>
              </div>

              {currentStep.id === 'ring' && (
                <div>
                  <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        Типоразмер
                      </span>
                      <button
                        type="button"
                        onClick={onOpenPresets}
                        className="inline-flex min-h-6 items-center text-[11px] font-semibold text-[#154b96] hover:underline cursor-pointer"
                      >
                        Авто-пресеты…
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {QUICK_SIZES.map((q) => {
                        const selected = !wideRange && activeQuickSize === q.id;
                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => onSelectQuickSize(q.patch)}
                            className={`flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                              selected
                                ? 'border-[#1e63c4] bg-[#eaf1fb] text-[#154b96]'
                                : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                            }`}
                          >
                            <span className="text-[12px] font-bold leading-tight whitespace-nowrap">
                              {q.label}
                              <span className="font-normal text-slate-600"> · {q.inch}</span>
                            </span>
                            <span className="font-mono-num text-[10px] text-slate-600 mt-0.5 whitespace-nowrap">
                              {q.dims}
                            </span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => onToggleCustomRange(true)}
                        className={`flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                          wideRange || activeQuickSize === null
                            ? 'border-[#1e63c4] bg-[#eaf1fb] text-[#154b96]'
                            : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-[12px] font-bold leading-tight whitespace-nowrap">Произвольный</span>
                        <span className="font-mono-num text-[10px] text-slate-600 mt-0.5 whitespace-nowrap">
                          Ø50–500 · любой
                        </span>
                      </button>
                    </div>
                  </div>
                  <RingControlsBody
                    state={state}
                    analysis={analysis}
                    wideRange={wideRange}
                    autoFitHolesActive={autoFitHolesActive}
                    showRangeToggle={false}
                    constraint={constraint}
                    onPatch={onPatch}
                    onToggleCustomRange={onToggleCustomRange}
                    onAutoFitHoles={onAutoFitHoles}
                    onDismissConstraint={onDismissConstraint}
                    onFocusTarget={onFocusTarget}
                  />
                </div>
              )}

              {currentStep.id === 'door' && (
                <LayerCardBody
                  layer="door"
                  state={state}
                  wideRange={wideRange}
                  constraint={constraint}
                  onPatch={onPatch}
                  onDismissConstraint={onDismissConstraint}
                  onFocusTarget={onFocusTarget}
                  onCopyLayer={onCopyLayer}
                />
              )}

              {currentStep.id === 'spk' && (
                <LayerCardBody
                  layer="spk"
                  state={state}
                  wideRange={wideRange}
                  constraint={constraint}
                  onPatch={onPatch}
                  onDismissConstraint={onDismissConstraint}
                  onFocusTarget={onFocusTarget}
                  onCopyLayer={onCopyLayer}
                />
              )}

              {currentStep.id === 'export' &&
                (() => {
                  const isPrintMode = state.material === 'abs';
                  const stlDisabled = !ready3d || analysis.nErr > 0;
                  const cbCount = analysis.holes.filter(
                    (h) => h.valid && h.cbDepth > 0 && h.recessType === 'cb'
                  ).length;
                  const cskCount = analysis.holes.filter(
                    (h) => h.valid && h.cbDepth > 0 && h.recessType === 'csk'
                  ).length;
                  const contourCount =
                    1 + (analysis.cutValid ? 1 : 0) + analysis.holes.filter((h) => h.valid).length + cbCount + cskCount;
                  const dxfLayers = [
                    'Контур',
                    'Вырез',
                    'Дверь',
                    'Динамик',
                    cbCount > 0 ? 'Цековка' : null,
                    cskCount > 0 ? 'Зенковка' : null,
                  ].filter(Boolean);

                  return (
                    <div className="p-3 space-y-3">
                      {/* 2-way production target */}
                      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Способ изготовления">
                        <button
                          type="button"
                          aria-pressed={isPrintMode}
                          onClick={() => onPatch({ material: 'abs', tint: '#ffffff' })}
                          className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                            isPrintMode
                              ? 'border-[#1e63c4] bg-[#eaf1fb]/80'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                              isPrintMode
                                ? 'border-[#1e63c4]/25 bg-white text-[#1e63c4]'
                                : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                          >
                            <Box className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <div
                              className={`text-[12px] font-semibold leading-tight ${
                                isPrintMode ? 'text-[#154b96]' : 'text-slate-800'
                              }`}
                            >
                              3D-печать
                            </div>
                            <div className="text-[10.5px] text-slate-600 mt-0.5">Модель STL · мм</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          aria-pressed={!isPrintMode}
                          onClick={() => onPatch({ material: 'fanera', tint: '#ffffff' })}
                          className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                            !isPrintMode
                              ? 'border-[#1e63c4] bg-[#eaf1fb]/80'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                              !isPrintMode
                                ? 'border-[#1e63c4]/25 bg-white text-[#1e63c4]'
                                : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                          >
                            <Layers className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <div
                              className={`text-[12px] font-semibold leading-tight ${
                                !isPrintMode ? 'text-[#154b96]' : 'text-slate-800'
                              }`}
                            >
                              Фрезеровка
                            </div>
                            <div className="text-[10.5px] text-slate-600 mt-0.5">Фанера · DXF / ЧПУ</div>
                          </div>
                        </button>
                      </div>

                      {isPrintMode ? (
                        <div className="space-y-2.5 pt-2 border-t border-slate-100">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11.5px] font-medium text-slate-700">Детализация STL</span>
                            <div
                              className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
                              role="group"
                              aria-label="Детализация 3D-сетки"
                            >
                              {QUALITY_OPTS.map(([val, lbl]) => {
                                const active = state.quality === val;
                                return (
                                  <button
                                    key={val}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => onPatch({ quality: val })}
                                    className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                                      active
                                        ? 'bg-white text-[#154b96] shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                  >
                                    {lbl}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={onExportSTL}
                            disabled={stlDisabled}
                            className="flex w-full items-center justify-between gap-2 rounded-lg bg-[#1e63c4] px-3.5 py-2.5 text-left text-white shadow-2xs hover:bg-[#154b96] disabled:bg-red-50 disabled:text-red-800 disabled:border disabled:border-red-200 disabled:shadow-none disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/50"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <Box className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span className="text-[12.5px] font-semibold">
                                {analysis.nErr > 0 ? 'STL заблокирован — исправьте ошибки' : 'Скачать STL (3D-печать)'}
                              </span>
                            </span>
                            <Download className="h-4 w-4 shrink-0 opacity-90" aria-hidden="true" />
                          </button>

                          <p className="text-[11px] leading-snug text-slate-500">
                            Замкнутая 3D-сетка в миллиметрах — включает цековки и зенковки обоих слоёв.
                          </p>

                          <div className="grid grid-cols-2 gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={onExportDXF}
                              className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 hover:border-[#1e63c4] hover:text-[#154b96] transition-colors cursor-pointer"
                            >
                              <Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span>DXF R12 (ЧПУ)</span>
                            </button>
                            <button
                              type="button"
                              onClick={onExportSVG}
                              className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 hover:border-[#1e63c4] hover:text-[#154b96] transition-colors cursor-pointer"
                            >
                              <FileCode2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span>Чертёж SVG 1:1</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5 pt-2 border-t border-slate-100">
                          <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-700">В файле DXF R12</span>
                              <span className="font-mono-num text-[10.5px] text-slate-500">
                                {contourCount} контуров
                              </span>
                            </div>
                            <div className="font-mono-num mt-1 text-[10.5px] text-slate-600 leading-relaxed">
                              {dxfLayers.join(' · ')}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={onExportDXF}
                            className="flex w-full items-center justify-between gap-2 rounded-lg bg-[#1e63c4] px-3.5 py-2.5 text-left text-white shadow-2xs hover:bg-[#154b96] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/50"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span className="text-[12.5px] font-semibold">Скачать DXF R12 (ЧПУ)</span>
                            </span>
                            <Download className="h-4 w-4 shrink-0 opacity-90" aria-hidden="true" />
                          </button>

                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={onExportSVG}
                              className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 hover:border-[#1e63c4] hover:text-[#154b96] transition-colors cursor-pointer"
                            >
                              <FileCode2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span>Шаблон SVG 1:1</span>
                            </button>
                            <button
                              type="button"
                              onClick={onExportSTL}
                              disabled={stlDisabled}
                              className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 hover:border-[#1e63c4] hover:text-[#154b96] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            >
                              <Box className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span>3D-модель STL</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
            </section>

            {/* Compact Model Summary on Final Step */}
            {currentStep.id === 'export' && (
              <section
                aria-label="Сводка собранной модели"
                className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Итог модели</span>
                  <button
                    type="button"
                    onClick={onOpenExport}
                    className="inline-flex min-h-6 items-center gap-1 text-[11px] font-semibold text-[#154b96] hover:underline cursor-pointer"
                  >
                    <span>Все форматы…</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <div className="text-[10px] font-medium text-slate-500">Кольцо</div>
                    <div className="font-mono-num font-semibold text-slate-800 mt-0.5">{ringSummary}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <div className="text-[10px] font-medium text-slate-500">Полка и кромка</div>
                    <div className="font-mono-num font-semibold text-slate-800 mt-0.5">
                      {fmtN(analysis.ringW)} мм · {state.chamfer ? 'фаска' : 'прямой'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <div className="text-[10px] font-medium text-slate-500">Крепёж к двери</div>
                    <div className="font-mono-num font-semibold text-[#154b96] mt-0.5">{doorSummary}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <div className="text-[10px] font-medium text-slate-500">Крепёж динамика</div>
                    <div className="font-mono-num font-semibold text-[#b8431a] mt-0.5">{spkSummary}</div>
                  </div>
                </div>

                {hasIssue ? (
                  <button
                    type="button"
                    onClick={onOpenChecks}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[11.5px] font-medium transition-colors cursor-pointer ${
                      analysis.nErr > 0
                        ? 'border-red-200 bg-red-50 text-red-900 hover:bg-red-100/80'
                        : 'border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100/80'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {analysis.nErr > 0 ? (
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                      )}
                      <span className="truncate">{analysis.checks[0]?.short ?? analysis.checks[0]?.t}</span>
                    </span>
                    <span className="shrink-0 font-semibold underline underline-offset-2">Контроль</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-[11.5px] font-medium text-emerald-900">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>Геометрия проверена · готова к экспорту</span>
                  </div>
                )}
              </section>
            )}
          </div>
          {canScrollDown && (
            <div
              aria-hidden="true"
              className="pointer-events-none hidden lg:block absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc]/80 to-transparent"
            />
          )}
        </div>

        {/* Sticky Wizard Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white px-2.5 py-2.5">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={handleWizardPrev}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Назад</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onReset}
              title="Сбросить к стандарту 16,5 см"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45"
            >
              <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Сброс</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleWizardNext}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/50 focus-visible:ring-offset-1 ${
              stepIndex < WIZARD_STEPS.length - 1
                ? 'bg-[#1e63c4] text-white shadow-2xs hover:bg-[#154b96]'
                : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span>{currentStep.nextLabel}</span>
            {stepIndex < WIZARD_STEPS.length - 1 ? (
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Параметры детали"
      className="flex flex-col overflow-hidden rounded-xl border border-[#cfd8e3] bg-[#f8fafc] shadow-xs lg:min-h-0 lg:w-[404px] lg:shrink-0"
    >
      {/* Sidebar header aligned with card edges (px-2.5) and viewport toolbar rail (py-3 + h-9) */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2.5 py-3">
        <h2 className="pl-0.5 text-[12px] font-bold tracking-wider uppercase text-slate-800 truncate">
          Параметры детали
        </h2>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onStartWizard}
            title="Запустить пошаговый мастер создания"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-700 hover:border-[#1e63c4] hover:bg-blue-50/50 hover:text-[#154b96] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45"
          >
            <WizardStepsIcon className="h-4 w-4 shrink-0" />
            <span>Мастер</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleAll(!anyOpen)}
            title={anyOpen ? 'Свернуть все карточки' : 'Развернуть все карточки'}
            aria-label={anyOpen ? 'Свернуть все карточки' : 'Развернуть все карточки'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-[#1e63c4] hover:bg-blue-50/50 hover:text-[#1e63c4] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45"
          >
            {anyOpen ? (
              <ChevronsDownUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={onReset}
            title="Сбросить к стандарту 16,5 см"
            aria-label="Сбросить к стандарту"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-[#1e63c4] hover:bg-blue-50/50 hover:text-[#1e63c4] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Scrollable stacked independent cards with subtle bottom scroll affordance */}
      <div className="relative flex flex-col lg:flex-1 lg:min-h-0">
        <div ref={scrollRef} onScroll={checkScroll} className="p-2.5 space-y-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
          {/* 1. Ring dimensions */}
          <CollapsibleCard
            id="card-ring"
            headingId="heading-ring"
            title="Размеры кольца"
            summary={ringSummary}
            icon={<RingDimensionsIcon className="h-[18px] w-[18px] text-slate-600 shrink-0" />}
            open={ui.open.ring}
            onToggle={() => onToggleAccordion('ring')}
          >
            <RingControlsBody
              state={state}
              analysis={analysis}
              wideRange={wideRange}
              autoFitHolesActive={false}
              showRangeToggle={true}
              constraint={constraint}
              onPatch={onPatch}
              onToggleCustomRange={onToggleCustomRange}
              onAutoFitHoles={onAutoFitHoles}
              onDismissConstraint={onDismissConstraint}
              onFocusTarget={onFocusTarget}
            />
          </CollapsibleCard>

          {/* 2. Door fasteners */}
          <CollapsibleCard
            id="card-door"
            headingId="heading-door"
            title="Крепление к двери"
            summary={doorSummary}
            summaryColor="#154b96"
            icon={<DoorBoltLayerIcon className="h-[18px] w-[18px] text-[#1e63c4] shrink-0" />}
            open={ui.open.door}
            onToggle={() => onToggleAccordion('door')}
          >
            <LayerCardBody
              layer="door"
              state={state}
              wideRange={wideRange}
              constraint={constraint}
              onPatch={onPatch}
              onDismissConstraint={onDismissConstraint}
              onFocusTarget={onFocusTarget}
              onCopyLayer={onCopyLayer}
            />
          </CollapsibleCard>

          {/* 3. Speaker fasteners */}
          <CollapsibleCard
            id="card-spk"
            headingId="heading-spk"
            title="Крепление динамика"
            summary={spkSummary}
            summaryColor="#b8431a"
            icon={<SpeakerLayerIcon className="h-[18px] w-[18px] text-[#d9541e] shrink-0" />}
            open={ui.open.spk}
            onToggle={() => onToggleAccordion('spk')}
          >
            <LayerCardBody
              layer="spk"
              state={state}
              wideRange={wideRange}
              constraint={constraint}
              onPatch={onPatch}
              onDismissConstraint={onDismissConstraint}
              onFocusTarget={onFocusTarget}
              onCopyLayer={onCopyLayer}
            />
          </CollapsibleCard>

          {/* 4. Scene & Drawing */}
          <CollapsibleCard
            id="card-scene"
            headingId="heading-scene"
            title="Сцена и чертёж"
            summary={Q_LABELS[state.quality]}
            icon={<SceneCubeIcon className="h-[18px] w-[18px] text-slate-600 shrink-0" />}
            open={ui.open.scene}
            onToggle={() => onToggleAccordion('scene')}
          >
            <div className="p-3 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-slate-700">Вид заготовки в 3D</span>
                <div
                  className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
                  role="group"
                  aria-label="Вид заготовки в 3D"
                >
                  <button
                    type="button"
                    aria-pressed={state.material !== 'abs'}
                    onClick={() => onPatch({ material: 'fanera', tint: '#ffffff' })}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                      state.material !== 'abs'
                        ? 'bg-white text-[#154b96] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Фанера
                  </button>
                  <button
                    type="button"
                    aria-pressed={state.material === 'abs'}
                    onClick={() => onPatch({ material: 'abs', tint: '#ffffff' })}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                      state.material === 'abs'
                        ? 'bg-white text-[#154b96] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Пластик
                  </button>
                </div>
              </div>
              <SelectField<QualityMode>
                label="Качество 3D-сетки и теней"
                value={state.quality}
                options={QUALITY_OPTS}
                onChange={(v) => {
                  onPatch({ quality: v });
                }}
              />
              <SelectField<SceneBgMode>
                label="Фон 3D-сцены"
                value={state.sceneBg}
                options={BG_OPTS}
                onChange={(v) => {
                  onPatch({ sceneBg: v });
                }}
              />
              <div className="border-t border-slate-100 pt-2.5 flex flex-col gap-2.5">
                <ToggleField
                  label="Координатная сетка"
                  checked={state.grid}
                  onChange={(v) => {
                    onPatch({ grid: v });
                  }}
                />
                <ToggleField
                  label="Кромки детали (каркас)"
                  checked={state.edges}
                  onChange={(v) => {
                    onPatch({ edges: v });
                  }}
                />
                <ToggleField
                  label="Автовращение 3D-модели"
                  checked={state.autoRotate}
                  onChange={(v) => {
                    onPatch({ autoRotate: v });
                  }}
                />
                {state.autoRotate && (
                  <SliderField
                    label="Скорость вращения"
                    value={state.rotSpeed}
                    min={0}
                    max={2}
                    step={0.1}
                    onChange={(v) => onPatch({ rotSpeed: v })}
                  />
                )}
                <ToggleField
                  label="Размерные линии на чертеже"
                  checked={state.showDims}
                  onChange={(v) => {
                    onPatch({ showDims: v });
                  }}
                />
              </div>
            </div>
          </CollapsibleCard>
        </div>
        {canScrollDown && (
          <div
            aria-hidden="true"
            className="pointer-events-none hidden lg:block absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc]/80 to-transparent"
          />
        )}
      </div>
    </aside>
  );
}
