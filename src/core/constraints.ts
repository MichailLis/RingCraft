import { t } from '../i18n';
import { LIMITS } from './constants';
import { analyze, clamp, fastFor, fmtN, sanitizeState } from './geometry';
import type { AnalysisResult, LayerKind, SpacerState } from './types';

export type ConstrainedField =
  | 'outerD'
  | 'innerD'
  | 'thick'
  | 'doorBCD'
  | 'doorN'
  | 'doorHoleD'
  | 'doorRot'
  | 'doorAutoSpace'
  | 'doorSlots'
  | 'slotAngle'
  | 'doorBolt'
  | 'doorRecess'
  | 'doorHeadClear'
  | 'ears'
  | 'earMargin'
  | 'spkBCD'
  | 'spkN'
  | 'spkHoleD'
  | 'spkRot'
  | 'spkSlots'
  | 'spkSlotAngle'
  | 'spkBolt'
  | 'spkRecess'
  | 'spkHeadClear'
  | 'copyLayer';

export type ConstraintJumpTarget = 'ring' | 'door' | 'spk';

export interface ConstraintNotice {
  field: ConstrainedField;
  reason: string;
  blockingLayer?: LayerKind;
  blockingTarget?: ConstraintJumpTarget;
  attemptedPatch?: Partial<SpacerState>;
  canAutoFitHoles?: boolean;
}

export interface ConstrainedResult {
  state: SpacerState;
  applied: boolean;
  clamped: boolean;
  notice: ConstraintNotice | null;
}

type NumericField =
  | 'outerD'
  | 'innerD'
  | 'thick'
  | 'doorBCD'
  | 'doorN'
  | 'doorHoleD'
  | 'doorRot'
  | 'slotAngle'
  | 'doorHeadClear'
  | 'earMargin'
  | 'spkBCD'
  | 'spkN'
  | 'spkHoleD'
  | 'spkRot'
  | 'spkSlotAngle'
  | 'spkHeadClear';

const NUMERIC_STEPS: Record<NumericField, number> = {
  outerD: 1,
  innerD: 1,
  thick: 1,
  doorBCD: 1,
  doorN: 1,
  doorHoleD: 0.1,
  doorRot: 0.5,
  slotAngle: 1,
  doorHeadClear: 0.1,
  earMargin: 0.5,
  spkBCD: 1,
  spkN: 1,
  spkHoleD: 0.1,
  spkRot: 0.5,
  spkSlotAngle: 1,
  spkHeadClear: 0.1,
};

function isNumericField(field: ConstrainedField): field is NumericField {
  return field in NUMERIC_STEPS;
}

function roundToStep(v: number, step: number): number {
  const decimals = step < 1 ? 2 : 0;
  return +(Math.round(v / step) * step).toFixed(decimals);
}

function isAcceptable(prevAnalysis: AnalysisResult, nextAnalysis: AnalysisResult): boolean {
  if (nextAnalysis.nErr === 0) return true;
  if (prevAnalysis.nErr > 0 && nextAnalysis.nErr < prevAnalysis.nErr) return true;
  return false;
}

function inferPrimaryField(patch: Partial<SpacerState>): ConstrainedField | null {
  const keys = Object.keys(patch) as (keyof SpacerState)[];
  if (keys.length === 1) {
    const k = keys[0] as ConstrainedField;
    return k;
  }
  if (keys.length === 2) {
    if ('doorBolt' in patch && 'doorHoleD' in patch) return 'doorBolt';
    if ('spkBolt' in patch && 'spkHoleD' in patch) return 'spkBolt';
  }
  return null;
}

function layerTitle(kind: LayerKind): string {
  return kind === 'door' ? t('крепления к двери') : t('крепления динамика');
}

function layerShort(kind: LayerKind): string {
  return kind === 'door' ? t('дверь') : t('динамик');
}

function hasSameLayerOverlap(s: SpacerState, kind: LayerKind): boolean {
  // Test overlap when the opposite layer has 0 effect by isolating geometry
  const a = analyze(s);
  const holes = a.holes.filter((h) => h.kind === kind && (h.valid || h.overlap));
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const ha = holes[i];
      const hb = holes[j];
      const d = Math.hypot(ha.cx - hb.cx, ha.cy - hb.cy);
      if (ha.type === 'circle' && hb.type === 'circle') {
        if (d < ha.effR + hb.effR - 0.05) return true;
      } else {
        const angA = ha.type === 'slot' ? ha.ang : Math.atan2(ha.cy, ha.cx);
        const angB = hb.type === 'slot' ? hb.ang : Math.atan2(hb.cy, hb.cx);
        const distA = ha.type === 'slot' ? ha.d : Math.hypot(ha.cx, ha.cy);
        const distB = hb.type === 'slot' ? hb.d : Math.hypot(hb.cx, hb.cy);
        const angDiff = Math.abs(Math.atan2(Math.sin(angA - angB), Math.cos(angA - angB)));
        const spanA = ha.type === 'slot' ? ha.half + ha.effR / distA : ha.effR / Math.max(1e-3, distA);
        const spanB = hb.type === 'slot' ? hb.half + hb.effR / distB : hb.effR / Math.max(1e-3, distB);
        if (angDiff < spanA + spanB - 0.002) return true;
      }
    }
  }
  return false;
}

function formatLimitPrefix(
  field: ConstrainedField,
  curVal: number | undefined,
  attemptedVal: number | undefined,
  clampedVal: number | undefined
): string {
  if (clampedVal === undefined || curVal === undefined || attemptedVal === undefined) {
    return '';
  }
  const unit =
    field === 'doorRot' || field === 'spkRot' || field === 'slotAngle' || field === 'spkSlotAngle'
      ? '°'
      : field === 'doorN' || field === 'spkN'
        ? t(' отв.')
        : t(' мм');
  const dec =
    field === 'doorHoleD' ||
    field === 'spkHoleD' ||
    field === 'doorHeadClear' ||
    field === 'spkHeadClear' ||
    field === 'earMargin' ||
    field === 'doorRot' ||
    field === 'spkRot'
      ? 1
      : 0;
  const goingDown = attemptedVal < curVal;
  if (field === 'doorRot' || field === 'spkRot') {
    return t('Упор на {0}°: ', fmtN(clampedVal, 1));
  }
  const sign = goingDown ? '≥' : '≤';
  return t('Ограничение {0} {1}{2}: ', sign, fmtN(clampedVal, dec), unit);
}

function explainConflict(
  prev: SpacerState,
  attempted: SpacerState,
  attemptedAnalysis: AnalysisResult,
  field: ConstrainedField,
  clampedVal?: number
): ConstraintNotice {
  const curNum = isNumericField(field) ? prev[field] : undefined;
  const attNum = isNumericField(field) ? attempted[field] : undefined;
  const prefix = formatLimitPrefix(field, curNum, attNum, clampedVal);

  // 1. Cutout vs outer contour
  if (!attemptedAnalysis.cutValid) {
    if (field === 'outerD') {
      return {
        field,
        reason: t('{0}внешний диаметр не может быть меньше внутреннего выреза ({1} мм).', prefix, fmtN(prev.innerD, 0)),
      };
    }
    if (field === 'innerD') {
      return {
        field,
        reason: t('{0}внутренний вырез не может перекрывать внешний диаметр ({1} мм).', prefix, fmtN(prev.outerD, 0)),
      };
    }
    return {
      field,
      reason: t(
        'Вырез ({0} мм) перекрывает внешний контур ({1} мм).',
        fmtN(attempted.innerD, 0),
        fmtN(attempted.outerD, 0)
      ),
    };
  }

  // 2. Counterbore / countersink floor thickness (< 2 mm)
  const fd = fastFor(attempted, 'door');
  const fs = fastFor(attempted, 'spk');
  const cbFailDoor = fd.active && attempted.thick - fd.cbDepth < 2;
  const cbFailSpk = fs.active && attempted.thick - fs.cbDepth < 2;
  if (cbFailDoor || cbFailSpk) {
    const worstKind: LayerKind =
      cbFailDoor && cbFailSpk ? (fd.cbDepth >= fs.cbDepth ? 'door' : 'spk') : cbFailDoor ? 'door' : 'spk';
    const fa = worstKind === 'door' ? fd : fs;
    const minThick = Math.ceil(fa.cbDepth + 2);
    const isCsk = fa.recessType === 'csk';
    const recLower = isCsk ? t('зенковка 90°') : t('цековка');
    const recUpper = isCsk ? t('Зенковка 90°') : t('Цековка');
    const boltPart = fa.bolt !== 'custom' ? ` ${fa.bolt}` : '';

    if (field === 'thick') {
      return {
        field,
        blockingLayer: worstKind,
        blockingTarget: worstKind,
        reason: t(
          'Ограничение ≥ {0} мм: {1}{2} ({3}, глубина {4} мм) требует минимум 2 мм дна под головкой.',
          minThick,
          recLower,
          boltPart,
          layerShort(worstKind),
          fmtN(fa.cbDepth, 1)
        ),
      };
    }
    if (field === 'copyLayer') {
      return {
        field,
        blockingTarget: 'ring',
        reason: t(
          'Нельзя скопировать крепёж: {0}{1} ({2} мм) не помещается в толщину {3} мм (нужно ≥ {4} мм).',
          recLower,
          boltPart,
          fmtN(fa.cbDepth, 1),
          fmtN(prev.thick, 0),
          minThick
        ),
      };
    }
    return {
      field,
      blockingTarget: 'ring',
      reason: t(
        '{0}{1} (глубина {2} мм) не помещается в толщину {3} мм — увеличьте толщину до ≥ {4} мм.',
        recUpper,
        boltPart,
        fmtN(fa.cbDepth, 1),
        fmtN(prev.thick, 0),
        minThick
      ),
    };
  }

  // 3. Holes outside ring contour or hitting inner cutout
  const outHole = attemptedAnalysis.holes.find((h) => !h.valid && !h.overlap);
  if (outHole) {
    const outDist = outHole.type === 'slot' ? outHole.d : Math.hypot(outHole.cx, outHole.cy);
    const hitInner = outDist - outHole.effR - 0.35 < attemptedAnalysis.ir;
    const hitKind = outHole.kind;
    const bcdVal = hitKind === 'door' ? prev.doorBCD : prev.spkBCD;

    if (field === 'outerD') {
      return {
        field,
        blockingLayer: hitKind,
        blockingTarget: hitKind,
        reason: t(
          '{0}отверстия {1} (Ø окружности {2} мм) выходят за внешний контур.',
          prefix,
          layerTitle(hitKind),
          fmtN(bcdVal, 0)
        ),
      };
    }
    if (field === 'innerD') {
      return {
        field,
        blockingLayer: hitKind,
        blockingTarget: hitKind,
        reason: t(
          '{0}вырез упирается в отверстия {1} (Ø окружности {2} мм).',
          prefix,
          layerTitle(hitKind),
          fmtN(bcdVal, 0)
        ),
      };
    }
    if (field === 'ears') {
      return {
        field,
        blockingTarget: 'ring',
        reason: t(
          'Нельзя отключить ушки: при окружности отверстий {0} мм крепёж к двери выходит за внешний контур ({1} мм).',
          fmtN(prev.doorBCD, 0),
          fmtN(prev.outerD, 0)
        ),
      };
    }
    if (field === 'doorBCD' || field === 'spkBCD') {
      if (hitInner) {
        return {
          field,
          blockingTarget: 'ring',
          reason: t('{0}отверстия упираются во внутренний вырез ({1} мм).', prefix, fmtN(prev.innerD, 0)),
        };
      }
      if (field === 'doorBCD' && !prev.ears) {
        return {
          field,
          blockingTarget: 'ring',
          reason: t(
            '{0}отверстия выходят за внешний контур ({1} мм) — включите монтажные ушки или увеличьте диаметр кольца.',
            prefix,
            fmtN(prev.outerD, 0)
          ),
        };
      }
      return {
        field,
        blockingTarget: 'ring',
        reason: t('{0}отверстия выходят за внешний контур ({1} мм).', prefix, fmtN(prev.outerD, 0)),
      };
    }
    if (field === 'doorSlots' || field === 'spkSlots' || field === 'slotAngle' || field === 'spkSlotAngle') {
      return {
        field,
        blockingTarget: 'ring',
        reason: t(
          '{0}паз выходит за {1}.',
          prefix || t('Нельзя включить пазы: '),
          hitInner
            ? t('внутренний вырез ({0} мм)', fmtN(prev.innerD, 0))
            : t('внешний контур ({0} мм)', fmtN(prev.outerD, 0))
        ),
      };
    }
    if (field === 'earMargin') {
      return {
        field,
        reason: t('{0}вылет ушка должен полностью охватывать отверстие с запасом стенки.', prefix),
      };
    }
    if (field === 'copyLayer') {
      return {
        field,
        blockingTarget: 'ring',
        reason: t(
          'Нельзя скопировать крепёж: отверстия/головки {0} выходят за {1}.',
          layerTitle(hitKind),
          hitInner ? t('вырез ({0} мм)', fmtN(prev.innerD, 0)) : t('контур ({0} мм)', fmtN(prev.outerD, 0))
        ),
      };
    }
    return {
      field,
      blockingTarget: 'ring',
      reason: t(
        '{0}отверстие или головка упирается в {1}.',
        prefix || t('Нельзя применить: '),
        hitInner
          ? t('внутренний вырез ({0} мм)', fmtN(prev.innerD, 0))
          : t('внешний контур ({0} мм)', fmtN(prev.outerD, 0))
      ),
    };
  }

  // 4. Hole-to-hole overlap (same-layer or cross-layer)
  const ovHole = attemptedAnalysis.holes.find((h) => h.overlap);
  if (ovHole) {
    const fieldKind: LayerKind | undefined =
      field.startsWith('door') || field === 'slotAngle' ? 'door' : field.startsWith('spk') ? 'spk' : undefined;

    if (fieldKind && hasSameLayerOverlap(attempted, fieldKind)) {
      if (field === 'doorN' || field === 'spkN') {
        return {
          field,
          reason: t(
            'Нельзя поставить {0} отв.: отверстия в группе пересекаются — уменьшите диаметр, длину паза или увеличьте окружность отверстий.',
            fmtN(attNum ?? 0, 0)
          ),
        };
      }
      return {
        field,
        reason: t('{0}отверстия или пазы внутри группы пересекаются друг с другом.', prefix || t('Нельзя применить: ')),
      };
    }

    const otherLayer: LayerKind = fieldKind === 'door' ? 'spk' : 'door';
    if (field === 'doorN' || field === 'spkN') {
      return {
        field,
        blockingLayer: otherLayer,
        blockingTarget: otherLayer,
        reason: t(
          'Нельзя поставить {0} отв.: пересечение с отверстиями {1} — измените поворот или разведите окружности отверстий.',
          fmtN(attNum ?? 0, 0),
          layerTitle(otherLayer)
        ),
      };
    }
    if (field === 'copyLayer') {
      return {
        field,
        reason: t(
          'Нельзя скопировать крепёж: увеличенные головки пересекаются с другой группой — измените поворот или разведите окружности отверстий.'
        ),
      };
    }
    return {
      field,
      blockingLayer: fieldKind ? otherLayer : undefined,
      blockingTarget: fieldKind ? otherLayer : undefined,
      reason: t(
        '{0}пересечение с отверстиями {1} — измените поворот или разведите окружности отверстий.',
        prefix || t('Нельзя применить: '),
        layerTitle(otherLayer)
      ),
    };
  }

  // Fallback to first error check message
  const firstErr = attemptedAnalysis.checks.find((c) => c.lv === 'err');
  return {
    field,
    reason: firstErr?.t ?? t('Значение конфликтует с другими параметрами модели.'),
  };
}

/**
 * Applies a state patch while strictly preventing geometric conflicts.
 * - Multi-field atomic patches (presets, quick-sizes, reset) are validated as a whole.
 * - Single numeric fields clamp cleanly to the nearest valid value toward the requested target.
 * - Conflicting toggles/selects/steppers are blocked with an exact Russian explanation.
 */
export function applyConstrainedPatch(
  prev: SpacerState,
  patch: Partial<SpacerState>,
  explicitField?: ConstrainedField
): ConstrainedResult {
  const prevAnalysis = analyze(prev);
  const candidate = sanitizeState({ ...prev, ...patch });
  const candidateAnalysis = analyze(candidate);

  if (isAcceptable(prevAnalysis, candidateAnalysis)) {
    return {
      state: candidate,
      applied: true,
      clamped: false,
      notice: null,
    };
  }

  const field = explicitField ?? inferPrimaryField(patch);

  // If this is a numeric field (slider or stepper), find the furthest valid step from prev toward target
  if (field && isNumericField(field) && typeof patch[field] === 'number') {
    const step = NUMERIC_STEPS[field];
    const lim = LIMITS[field];
    const curVal = prev[field];
    const rawTarget = lim ? clamp(patch[field] as number, lim[0], lim[1]) : (patch[field] as number);
    const targetVal = roundToStep(rawTarget, step);

    // Stepper fields (doorN / spkN) jump by 1, so reject directly if targetVal is invalid
    if (field === 'doorN' || field === 'spkN') {
      return {
        state: prev,
        applied: false,
        clamped: true,
        notice: explainConflict(prev, candidate, candidateAnalysis, field, curVal),
      };
    }

    const dir = targetVal > curVal ? 1 : targetVal < curVal ? -1 : 0;
    let bestVal = curVal;

    if (dir !== 0) {
      // Walk from targetVal back toward curVal to find the nearest valid step to the user's cursor.
      // This handles both monotone wall stops (outerD/innerD/thick) and non-monotone obstacles (BCD/Rot).
      const totalSteps = Math.max(1, Math.round(Math.abs(targetVal - curVal) / step));
      const maxProbe = Math.min(totalSteps, 720);
      for (let k = 1; k < maxProbe; k++) {
        const probe = roundToStep(targetVal - dir * k * step, step);
        if ((dir > 0 && probe <= curVal) || (dir < 0 && probe >= curVal)) break;
        const probeState = sanitizeState({ ...prev, [field]: probe });
        if (isAcceptable(prevAnalysis, analyze(probeState))) {
          bestVal = probe;
          break;
        }
      }
    }

    const nextState = bestVal === curVal ? prev : sanitizeState({ ...prev, [field]: bestVal });
    // Build the exact failing neighbor just beyond bestVal to explain the exact barrier hit
    const barrierVal =
      dir !== 0
        ? roundToStep(lim ? clamp(bestVal + dir * step, lim[0], lim[1]) : bestVal + dir * step, step)
        : targetVal;
    const barrierState = sanitizeState({ ...nextState, [field]: barrierVal });
    const barrierAnalysis = analyze(barrierState);
    const explainState = barrierAnalysis.nErr > 0 ? barrierState : candidate;
    const explainAnalysis = barrierAnalysis.nErr > 0 ? barrierAnalysis : candidateAnalysis;

    const notice = explainConflict(nextState, explainState, explainAnalysis, field, bestVal);
    if ((field === 'outerD' || field === 'innerD' || field === 'thick') && notice.blockingLayer) {
      notice.attemptedPatch = { [field]: targetVal };
      notice.canAutoFitHoles = true;
    }

    return {
      state: nextState,
      applied: bestVal !== curVal,
      clamped: true,
      notice,
    };
  }

  // Non-numeric field (toggle, select, copyLayer) or conflicting multi-field patch: block cleanly
  return {
    state: prev,
    applied: false,
    clamped: true,
    notice: explainConflict(prev, candidate, candidateAnalysis, field ?? 'copyLayer'),
  };
}

const MIN_RING_DIFF = 12; // >= 6 mm radial wall width

function effectiveRadius(s: SpacerState, kind: LayerKind): number {
  const f = fastFor(s, kind);
  const holeR = (kind === 'door' ? s.doorHoleD : s.spkHoleD) / 2;
  return f.active ? Math.max(holeR, f.cbD / 2) : holeR;
}

function adaptFastenerForRing(base: SpacerState, kind: LayerKind, allowFastenerAdapt: boolean): SpacerState {
  const next = { ...base };
  const wall = (next.outerD - next.innerD) / 2;
  const isDoor = kind === 'door';
  const boltKey = isDoor ? 'doorBolt' : 'spkBolt';
  const recessKey = isDoor ? 'doorRecess' : 'spkRecess';
  const holeKey = isDoor ? 'doorHoleD' : 'spkHoleD';

  // 1. Thickness vs active recess floor (< 2 mm)
  const fa = fastFor(next, kind);
  if (fa.active && next.thick - fa.cbDepth < 2 && allowFastenerAdapt) {
    if (next[recessKey] === 'csk_deep') {
      const tryCsk = sanitizeState({ ...next, [recessKey]: 'csk' });
      const faCsk = fastFor(tryCsk, kind);
      next[recessKey] = tryCsk.thick - faCsk.cbDepth >= 2 ? 'csk' : 'none';
    } else if (next[recessKey] === 'deep') {
      const tryFlush = sanitizeState({ ...next, [recessKey]: 'flush' });
      const faFlush = fastFor(tryFlush, kind);
      next[recessKey] = tryFlush.thick - faFlush.cbDepth >= 2 ? 'flush' : 'none';
    } else {
      next[recessKey] = 'none';
    }
  }

  // 2. Radial hole/recess width vs wall width (for layers without outer ears, or when ears still must clear innerD)
  if (allowFastenerAdapt) {
    const canUseEars = isDoor && next.ears;
    const maxEffR = canUseEars ? Math.max(2.0, wall - 0.6) : Math.max(1.6, wall / 2 - 0.55);
    if (effectiveRadius(next, kind) > maxEffR) {
      next[recessKey] = 'none';
    }
    if (effectiveRadius(next, kind) > maxEffR) {
      const targetD = +clamp(Math.floor((maxEffR * 2 - 0.2) * 10) / 10, 2.5, 12).toFixed(1);
      next[boltKey] = 'custom';
      next[holeKey] = targetD;
    }
  }

  return sanitizeState(next);
}

/**
 * Resizes ring dimensions (`outerD`, `innerD`, `thick`) while automatically
 * repositioning unconfigured mounting holes (`doorBCD`, `spkBCD`) cleanly inside
 * the new ring wall so pre-placed holes never block broad Step 1 sizing.
 */
export function applyRingResizeWithAutoFit(
  prev: SpacerState,
  patch: Partial<SpacerState>,
  field: 'outerD' | 'innerD' | 'thick',
  allowFastenerAdapt = true
): ConstrainedResult {
  const lim = LIMITS[field];
  const rawVal = patch[field];
  if (typeof rawVal !== 'number' || !Number.isFinite(rawVal)) {
    return applyConstrainedPatch(prev, patch, field);
  }
  const targetVal = roundToStep(lim ? clamp(rawVal, lim[0], lim[1]) : rawVal, NUMERIC_STEPS[field]);

  // Basic physical ring check: outerD must exceed innerD by at least MIN_RING_DIFF (6 mm radial wall)
  let nextOuter = field === 'outerD' ? targetVal : prev.outerD;
  let nextInner = field === 'innerD' ? targetVal : prev.innerD;
  const nextThick = field === 'thick' ? targetVal : prev.thick;

  let ringClamped = false;
  let ringNotice: ConstraintNotice | null = null;

  if (field === 'outerD' && nextOuter < nextInner + MIN_RING_DIFF) {
    nextOuter = clamp(nextInner + MIN_RING_DIFF, LIMITS.outerD![0], LIMITS.outerD![1]);
    ringClamped = true;
    ringNotice = {
      field: 'outerD',
      reason: t(
        'Ограничение ≥ {0} мм: внешний диаметр должен быть больше внутреннего выреза ({1} мм) минимум на {2} мм. Сначала уменьшите вырез.',
        fmtN(nextOuter, 0),
        fmtN(nextInner, 0),
        MIN_RING_DIFF
      ),
    };
  } else if (field === 'innerD' && nextInner > nextOuter - MIN_RING_DIFF) {
    nextInner = clamp(nextOuter - MIN_RING_DIFF, LIMITS.innerD![0], LIMITS.innerD![1]);
    ringClamped = true;
    ringNotice = {
      field: 'innerD',
      reason: t(
        'Ограничение ≤ {0} мм: внутренний вырез должен оставлять стенку до внешнего диаметра ({1} мм). Сначала увеличьте внешний диаметр.',
        fmtN(nextInner, 0),
        fmtN(nextOuter, 0)
      ),
    };
  }

  let candidate = sanitizeState({
    ...prev,
    outerD: nextOuter,
    innerD: nextInner,
    thick: nextThick,
  });

  // Fast path: if existing holes already fit cleanly without moving anything, keep them untouched!
  if (analyze(candidate).nErr === 0) {
    return {
      state: candidate,
      applied: candidate.outerD !== prev.outerD || candidate.innerD !== prev.innerD || candidate.thick !== prev.thick,
      clamped: ringClamped,
      notice: ringNotice,
    };
  }

  // Adapt fasteners for thickness / very narrow walls when allowed
  candidate = adaptFastenerForRing(candidate, 'door', allowFastenerAdapt);
  candidate = adaptFastenerForRing(candidate, 'spk', allowFastenerAdapt);

  // Proportionally map doorBCD & spkBCD into the new ring wall [nextInner, nextOuter]
  const prevSpan = Math.max(1, prev.outerD - prev.innerD);
  const newSpan = Math.max(1, candidate.outerD - candidate.innerD);
  const doorOuter = prev.doorBCD >= prev.spkBCD;
  const tDoor = clamp((prev.doorBCD - prev.innerD) / prevSpan, doorOuter ? 0.55 : 0.25, doorOuter ? 0.85 : 0.55);
  const tSpk = clamp((prev.spkBCD - prev.innerD) / prevSpan, doorOuter ? 0.25 : 0.55, doorOuter ? 0.52 : 0.8);

  const doorEff = effectiveRadius(candidate, 'door');
  const spkEff = effectiveRadius(candidate, 'spk');

  const spkMin = Math.ceil(candidate.innerD + 2 * spkEff + 1.2);
  const spkMax = Math.floor(candidate.outerD - 2 * spkEff - 1.2);
  const spkMid = Math.round((candidate.innerD + candidate.outerD) / 2);
  const fitSpkBCD = spkMin <= spkMax ? clamp(Math.round(candidate.innerD + tSpk * newSpan), spkMin, spkMax) : spkMid;

  const doorMin = Math.ceil(candidate.innerD + 2 * doorEff + 1.2);
  const doorMax = candidate.ears ? Math.floor(candidate.outerD - 2) : Math.floor(candidate.outerD - 2 * doorEff - 1.2);
  const fitDoorBCD =
    doorMin <= doorMax
      ? clamp(Math.round(candidate.innerD + tDoor * newSpan), doorMin, doorMax)
      : Math.max(doorMin, Math.round(candidate.outerD - 2));

  candidate = sanitizeState({
    ...candidate,
    doorBCD: fitDoorBCD,
    spkBCD: fitSpkBCD,
  });

  if (analyze(candidate).nErr === 0) {
    return {
      state: candidate,
      applied: true,
      clamped: ringClamped,
      notice: ringNotice,
    };
  }

  // Resolve any remaining cross-layer overlap on compact rings by nudging doorBCD outward (with ears) or rotating spkRot
  const doorOutMax = candidate.ears
    ? Math.min(LIMITS.doorBCD![1], Math.round(candidate.outerD + candidate.earMargin - 2))
    : doorMax;
  for (let dBcd = fitDoorBCD; dBcd <= doorOutMax; dBcd += 2) {
    const rotTrials = allowFastenerAdapt
      ? [candidate.spkRot, (candidate.spkRot + 30) % 360, (candidate.spkRot + 45) % 360, (candidate.spkRot + 60) % 360]
      : [candidate.spkRot];
    for (const rot of rotTrials) {
      const trial = sanitizeState({ ...candidate, doorBCD: dBcd, spkRot: rot });
      if (analyze(trial).nErr === 0) {
        return {
          state: trial,
          applied: true,
          clamped: ringClamped,
          notice: ringNotice,
        };
      }
    }
  }

  // Fallback: standard constrained clamp so we never produce an invalid model
  return applyConstrainedPatch(prev, patch, field);
}
