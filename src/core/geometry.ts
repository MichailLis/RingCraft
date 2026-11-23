import { BOLTS, DEFAULTS, LIMITS, MATS } from './constants';
import type {
  AnalysisResult,
  CheckItem,
  FastenerSummary,
  HoleInfo,
  LayerKind,
  Point2D,
  SpacerState,
} from './types';

export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

export const fmtN = (v: number, d = 1): string => {
  const n = +v.toFixed(d);
  return n.toLocaleString('ru-RU', { maximumFractionDigits: d });
};

export const f2 = (v: number): number => +v.toFixed(2);

/** Returns the integer BCD centered midway between the inner cutout and outer ring edge. */
export const ringCenterBCD = (s: Pick<SpacerState, 'outerD' | 'innerD'>): number =>
  Math.round((s.outerD + s.innerD) / 2);

export function sanitizeState(p: Partial<SpacerState> | Record<string, unknown>): SpacerState {
  const s: SpacerState = { ...DEFAULTS };
  const record = p as Record<string, unknown>;
  for (const k of Object.keys(DEFAULTS) as (keyof SpacerState)[]) {
    if (!(k in record)) continue;
    const v = record[k];
    const def = DEFAULTS[k];
    if (typeof def === 'number' && typeof v === 'number' && Number.isFinite(v)) {
      const lim = LIMITS[k];
      (s[k] as number) = lim ? clamp(v, lim[0], lim[1]) : v;
    } else if (typeof def === 'boolean' && typeof v === 'boolean') {
      (s[k] as boolean) = v;
    } else if (typeof def === 'string' && typeof v === 'string') {
      (s[k] as string) = v;
    }
  }
  s.doorN = Math.round(s.doorN);
  s.spkN = Math.round(s.spkN);
  if (!MATS[s.material]) s.material = 'fanera';
  if (!['draft', 'std', 'high'].includes(s.quality)) s.quality = 'std';
  if (!['light', 'gray', 'dark'].includes(s.sceneBg)) s.sceneBg = 'light';
  if (!['3d', '2d'].includes(s.view)) s.view = '3d';
  if (!/^#[0-9a-fA-F]{6}$/.test(s.tint)) s.tint = '#ffffff';

  (['door', 'spk'] as const).forEach((kind) => {
    const boltKey = `${kind}Bolt` as const;
    const recessKey = `${kind}Recess` as const;
    const holeKey = `${kind}HoleD` as const;
    const boltVal = s[boltKey];
    if (boltVal !== 'custom' && !(boltVal in BOLTS)) {
      s[boltKey] = 'custom';
    }
    if (!['none', 'flush', 'deep', 'csk', 'csk_deep'].includes(s[recessKey])) {
      s[recessKey] = 'none';
    }
    const finalBolt = s[boltKey];
    if (finalBolt !== 'custom') {
      s[holeKey] = BOLTS[finalBolt].clear;
    } else if (s[recessKey] === 'flush' || s[recessKey] === 'deep') {
      s[recessKey] = 'none';
    }
  });
  return s;
}

export function fastFor(s: SpacerState, kind: LayerKind): FastenerSummary {
  const bolt = kind === 'door' ? s.doorBolt : s.spkBolt;
  const rec = kind === 'door' ? s.doorRecess : s.spkRecess;
  const headClear = kind === 'door' ? s.doorHeadClear : s.spkHeadClear;
  const isCsk = rec === 'csk' || rec === 'csk_deep';

  if (rec === 'none' || (bolt === 'custom' && !isCsk)) {
    return { active: false, recessType: 'none', bolt, cbD: 0, cbDepth: 0, actualCbDepth: 0 };
  }

  if (isCsk) {
    const B = bolt !== 'custom' ? BOLTS[bolt] : undefined;
    const holeD = B ? B.clear : kind === 'door' ? s.doorHoleD : s.spkHoleD;
    const baseDk = B ? B.cskDk : +(holeD * 1.9).toFixed(1);
    const extraD = rec === 'csk_deep' ? 1.0 : 0;
    const cbD = +(baseDk + headClear + extraD).toFixed(2);
    const cbDepth = +Math.max(0.5, (cbD - holeD) / 2).toFixed(2);
    const actualCbDepth = +Math.max(0, Math.min(cbDepth, s.thick - 0.5)).toFixed(2);
    return {
      active: true,
      recessType: 'csk',
      bolt,
      B,
      cbD,
      cbDepth,
      actualCbDepth,
    };
  }

  const B = BOLTS[bolt as Exclude<typeof bolt, 'custom'>];
  const cbDepth = B.k + (rec === 'deep' ? 1 : 0);
  const actualCbDepth = Math.max(0, Math.min(cbDepth, s.thick - 0.5));
  return {
    active: true,
    recessType: 'cb',
    bolt,
    B,
    cbD: B.dk + headClear,
    cbDepth,
    actualCbDepth,
  };
}

export const anyCb = (s: SpacerState): boolean =>
  fastFor(s, 'door').active || fastFor(s, 'spk').active;

export function outlineRadiusFn(s: SpacerState, inset = 0): (th: number) => number {
  const R = Math.max(1, s.outerD / 2 - inset);
  const lobes: [number, number, number][] = [];
  if (s.ears) {
    const d = s.doorBCD / 2;
    const fa = fastFor(s, 'door');
    const baseR = (fa.active ? fa.cbD : s.doorHoleD) / 2;
    const doorAngles = layerHoleAnglesDeg(s, 'door');
    if (s.doorSlots) {
      const h = (s.slotAngle * D2R) / 2;
      const rl = Math.max(0.5, baseR + s.earMargin - inset);
      const step = 2 * Math.asin(Math.min((0.8 * rl) / d, 1));
      const n = Math.max(2, Math.ceil((2 * h) / step));
      for (let i = 0; i < doorAngles.length; i++) {
        const a = doorAngles[i] * D2R;
        for (let k = 0; k <= n; k++) {
          lobes.push([d, a - h + (2 * h * k) / n, rl]);
        }
      }
    } else {
      const rl = Math.max(0.5, baseR + s.earMargin - inset);
      for (let i = 0; i < doorAngles.length; i++) {
        lobes.push([d, doorAngles[i] * D2R, rl]);
      }
    }
  }
  return (th: number) => {
    let r = R;
    for (let i = 0; i < lobes.length; i++) {
      const l = lobes[i];
      const del = th - l[1];
      const sn = l[0] * Math.sin(del);
      if (Math.abs(sn) < l[2]) {
        const c = l[0] * Math.cos(del) + Math.sqrt(l[2] * l[2] - sn * sn);
        if (c > r) r = c;
      }
    }
    return r;
  };
}

export function outlinePts(s: SpacerState, n: number): Point2D[] {
  const fn = outlineRadiusFn(s);
  const pts: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * TAU) / n;
    const r = fn(a);
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

export function slotPts(d: number, a: number, half: number, w: number): Point2D[] {
  const n = Math.max(10, Math.ceil((half * 2) / D2R / 2.5));
  const m = 9;
  const pts: Point2D[] = [];
  for (let t = 0; t <= n; t++) {
    const ang = a - half + (2 * half * t) / n;
    pts.push([(d + w / 2) * Math.cos(ang), (d + w / 2) * Math.sin(ang)]);
  }
  const ae = a + half;
  const ce: Point2D = [d * Math.cos(ae), d * Math.sin(ae)];
  const ue: Point2D = [Math.cos(ae), Math.sin(ae)];
  const ve: Point2D = [-ue[1], ue[0]];
  for (let t = 1; t < m; t++) {
    const p = (Math.PI * t) / m;
    pts.push([
      ce[0] + (w / 2) * (ue[0] * Math.cos(p) + ve[0] * Math.sin(p)),
      ce[1] + (w / 2) * (ue[1] * Math.cos(p) + ve[1] * Math.sin(p)),
    ]);
  }
  for (let t = 0; t <= n; t++) {
    const ang = a + half - (2 * half * t) / n;
    pts.push([(d - w / 2) * Math.cos(ang), (d - w / 2) * Math.sin(ang)]);
  }
  const as0 = a - half;
  const cs: Point2D = [d * Math.cos(as0), d * Math.sin(as0)];
  const us: Point2D = [Math.cos(as0), Math.sin(as0)];
  const vs: Point2D = [-us[1], us[0]];
  for (let t = 1; t < m; t++) {
    const p = (Math.PI * t) / m;
    pts.push([
      cs[0] + (w / 2) * (-us[0] * Math.cos(p) - vs[0] * Math.sin(p)),
      cs[1] + (w / 2) * (-us[1] * Math.cos(p) - vs[1] * Math.sin(p)),
    ]);
  }
  return pts;
}

function holeReps(h: HoleInfo): [number, number, number][] {
  const r = h.effR;
  if (h.type === 'circle') return [[h.cx, h.cy, r]];
  const out: [number, number, number][] = [];
  const d = h.d;
  const ext = h.half + r / d;
  for (let k = 0; k < 7; k++) {
    const ang = h.ang - ext + (2 * ext * k) / 6;
    out.push([d * Math.cos(ang), d * Math.sin(ang), r]);
  }
  return out;
}

function buildLayerHoles(
  s: SpacerState,
  kind: LayerKind,
  rf: (th: number) => number,
  ir: number,
  cutValid: boolean
): HoleInfo[] {
  const fa = fastFor(s, kind);
  const isDoor = kind === 'door';
  const d = (isDoor ? s.doorBCD : s.spkBCD) / 2;
  const slots = isDoor ? s.doorSlots : s.spkSlots;
  const slotAng = isDoor ? s.slotAngle : s.spkSlotAngle;
  const holeD = isDoor ? s.doorHoleD : s.spkHoleD;
  const cbR = fa.active ? fa.cbD / 2 : 0;
  const cbDepth = fa.active ? fa.actualCbDepth : 0;
  const anglesDeg = layerHoleAnglesDeg(s, kind);
  const holes: HoleInfo[] = [];

  for (let i = 0; i < anglesDeg.length; i++) {
    const a = anglesDeg[i] * D2R;
    const cx = d * Math.cos(a);
    const cy = d * Math.sin(a);
    if (slots) {
      const h = (slotAng * D2R) / 2;
      const w = holeD;
      const effR = fa.active ? fa.cbD / 2 : w / 2;
      const extE = h + effR / d;
      let ok = cutValid;
      if (ok) {
        for (let k = 0; k <= 10; k++) {
          const ang = a - extE + (2 * extE * k) / 10;
          if (d - effR - 0.35 < ir || rf(ang) < d + effR + 0.35) {
            ok = false;
            break;
          }
        }
      }
      holes.push({
        kind,
        idx: i + 1,
        type: 'slot',
        cx,
        cy,
        ang: a,
        d,
        half: h,
        w,
        span: slotAng,
        pts: slotPts(d, a, h, w),
        recessType: fa.recessType,
        cbR,
        cbW: fa.active ? fa.cbD : 0,
        cbPts: fa.active ? slotPts(d, a, h, fa.cbD) : null,
        cbDepth,
        effR,
        valid: ok,
        bolt: fa.bolt,
      });
    } else {
      const r = holeD / 2;
      const effR = fa.active ? fa.cbD / 2 : r;
      const ok = cutValid && d - effR - 0.35 >= ir && rf(a) >= d + effR + 0.35;
      holes.push({
        kind,
        idx: i + 1,
        type: 'circle',
        cx,
        cy,
        r,
        recessType: fa.recessType,
        cbR,
        cbDepth,
        effR,
        valid: ok,
        bolt: fa.bolt,
      });
    }
  }
  return holes;
}

export function analyze(s: SpacerState): AnalysisResult {
  const R = s.outerD / 2;
  const ir = s.innerD / 2;
  const rf = outlineRadiusFn(s);
  let maxR = R;
  for (let i = 0; i < 720; i++) {
    const r = rf((i * TAU) / 720);
    if (r > maxR) maxR = r;
  }
  const cutValid = ir < R - 1;
  const fd = fastFor(s, 'door');
  const fs = fastFor(s, 'spk');
  const holes = [...buildLayerHoles(s, 'door', rf, ir, cutValid), ...buildLayerHoles(s, 'spk', rf, ir, cutValid)];
  const repsArr = holes.map(holeReps);

  for (let i = 0; i < holes.length; i++) {
    if (!holes[i].valid) continue;
    for (let j = i + 1; j < holes.length; j++) {
      if (!holes[j].valid) continue;
      let hit = false;
      for (const ra of repsArr[i]) {
        for (const rb of repsArr[j]) {
          if (Math.hypot(ra[0] - rb[0], ra[1] - rb[1]) < ra[2] + rb[2] - 0.05) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        holes[j].valid = false;
        holes[j].overlap = true;
      }
    }
  }

  const checks: CheckItem[] = [];
  let nErr = 0;
  let nWarn = 0;
  const err = (t: string, layer?: LayerKind, short?: string) => {
    checks.push({ lv: 'err', t, short: short ?? t, layer });
    nErr++;
  };
  const warn = (t: string, layer?: LayerKind, short?: string) => {
    checks.push({ lv: 'warn', t, short: short ?? t, layer });
    nWarn++;
  };

  if (!cutValid) {
    err(
      `Проходное отверстие Ø${fmtN(s.innerD, 0)} перекрывает контур — уменьшите вырез или увеличьте внешний Ø.`,
      undefined,
      `Вырез Ø${fmtN(s.innerD, 0)} перекрывает контур`
    );
  }
  const badDoor = holes.filter((h) => h.kind === 'door' && !h.valid && !h.overlap).length;
  const badSpk = holes.filter((h) => h.kind === 'spk' && !h.valid && !h.overlap).length;
  const badOvD = holes.filter((h) => h.overlap && h.kind === 'door').length;
  const badOvS = holes.filter((h) => h.overlap && h.kind === 'spk').length;

  if (badDoor) {
    err(
      `Крепление к двери${fd.active ? ' (с головкой)' : ''}: вне кольца ${badDoor} отв. Увеличьте внешний диаметр, уменьшите окружность отверстий или включите ушки.`,
      'door',
      `Дверь: вне кольца ${badDoor} отв.`
    );
  }
  if (badSpk) {
    err(
      `Крепление динамика${fs.active ? ' (с головкой)' : ''}: вне кольца или в вырезе ${badSpk} отв. Проверьте окружность отверстий и вырез.`,
      'spk',
      `Динамик: вне кольца ${badSpk} отв.`
    );
  }
  if (badOvD) {
    err(
      `Крепление к двери: ${badOvD} отв. пересекаются с крепежом динамика и исключены. Поверните группу или разведите окружности отверстий.`,
      'door',
      `Пересечение отверстий (${badOvD} отв.)`
    );
  }
  if (badOvS) {
    err(
      `Крепление динамика: ${badOvS} отв. пересекаются с крепежом к двери и исключены. Поверните группу или разведите окружности отверстий.`,
      'spk',
      `Пересечение отверстий (${badOvS} отв.)`
    );
  }

  (
    [
      ['door', 'Крепление к двери', 'Дверь', fd],
      ['spk', 'Крепление динамика', 'Динамик', fs],
    ] as const
  ).forEach(([k, label, shortTag, fa]) => {
    if (fa.active) {
      const nominalFloor = s.thick - fa.cbDepth;
      const actualFloor = Math.max(0, s.thick - fa.actualCbDepth);
      const isClamped = fa.actualCbDepth < fa.cbDepth - 1e-3;
      const isCsk = fa.recessType === 'csk';
      const recessNoun = isCsk ? 'зенковка' : 'цековка';
      const recessInstr = isCsk ? 'зенковкой 90°' : 'цековкой';
      const boltTag = fa.bolt !== 'custom' ? ` ${fa.bolt}` : '';
      if (nominalFloor < 2) {
        const clampNote = isClamped
          ? ` (${recessNoun} подрезана до ${fmtN(fa.actualCbDepth, 1)}\u00A0мм)`
          : '';
        err(
          `${label}: под ${recessInstr}${boltTag} остаётся ${fmtN(actualFloor, 1)}\u00A0мм дна${clampNote} — увеличьте толщину (≥\u00A02\u00A0мм) или выберите меньший крепёж.`,
          k,
          `${shortTag}: дно ${fmtN(actualFloor, 1)}\u00A0мм (≥\u00A02\u00A0мм)`
        );
      } else if (nominalFloor < 3) {
        warn(
          `${label}: тонкое дно под ${recessInstr} — ${fmtN(actualFloor, 1)}\u00A0мм (рекомендуется ≥\u00A03\u00A0мм).`,
          k,
          `${shortTag}: дно ${fmtN(actualFloor, 1)}\u00A0мм (≥\u00A03\u00A0мм)`
        );
      }
    }
  });

  const valid = holes.filter((h) => h.valid);
  const vReps = valid.map(holeReps);
  let minWeb = Infinity;
  let thinPairs = 0;

  for (let i = 0; i < valid.length; i++) {
    for (const ra of vReps[i]) {
      const dc = Math.hypot(ra[0], ra[1]);
      minWeb = Math.min(minWeb, dc - ra[2] - ir, rf(Math.atan2(ra[1], ra[0])) - dc - ra[2]);
    }
    for (let j = i + 1; j < valid.length; j++) {
      let gMin = Infinity;
      for (const ra of vReps[i]) {
        for (const rb of vReps[j]) {
          gMin = Math.min(gMin, Math.hypot(ra[0] - rb[0], ra[1] - rb[1]) - ra[2] - rb[2]);
        }
      }
      minWeb = Math.min(minWeb, gMin);
      if (gMin < 0.8) thinPairs++;
    }
  }
  if (!Number.isFinite(minWeb)) minWeb = (s.outerD - s.innerD) / 2;
  if (nErr === 0 && thinPairs) {
    warn(
      `Отверстия/головки почти сливаются (пар: ${thinPairs}) — перемычка менее 0,8\u00A0мм.`,
      undefined,
      `Сближение (< 0,8\u00A0мм)`
    );
  }
  if (nErr === 0 && minWeb < 2.5) {
    warn(
      `Тонкая перемычка ${fmtN(Math.max(minWeb, 0))}\u00A0мм — рекомендуется не менее 3\u00A0мм.`,
      undefined,
      `Перемычка ${fmtN(Math.max(minWeb, 0))}\u00A0мм (≥\u00A03\u00A0мм)`
    );
  }
  const ringW = (s.outerD - s.innerD) / 2;
  if (nErr === 0 && ringW < 8) {
    warn(
      `Узкое кольцо: ${fmtN(ringW)}\u00A0мм — проверьте жёсткость проставки.`,
      undefined,
      `Полка ${fmtN(ringW)}\u00A0мм (≥\u00A08\u00A0мм)`
    );
  }
  if (s.material === 'mdf' && s.thick < 6) {
    warn(
      'МДФ тоньше 6\u00A0мм склонен к сколам — возьмите фанеру или увеличьте толщину.',
      undefined,
      'МДФ < 6\u00A0мм — риск сколов'
    );
  }
  if (!checks.length) {
    checks.push({ lv: 'ok', t: 'Геометрия корректна — оба слоя независимы и готовы к раскрою / печати.' });
  }

  return {
    R,
    ir,
    rf,
    maxR,
    cutValid,
    holes,
    checks,
    nErr,
    nWarn,
    minWeb,
    ringW,
    fd,
    fs,
    anyCb: fd.active || fs.active,
    oPts: outlinePts(s, 720),
  };
}

export function layerDesc(s: SpacerState, kind: LayerKind): string {
  const fa = fastFor(s, kind);
  const n = kind === 'door' ? s.doorN : s.spkN;
  const slots = kind === 'door' ? s.doorSlots : s.spkSlots;
  const holeD = kind === 'door' ? s.doorHoleD : s.spkHoleD;
  const head = slots ? 'пазы ' : '';
  const recessStr = !fa.active
    ? ''
    : fa.recessType === 'csk'
      ? ` ⌵${fmtN(fa.cbD)}×90°`
      : ` ⌴${fmtN(fa.cbD)}×${fmtN(fa.actualCbDepth, 1)}`;
  if (fa.bolt !== 'custom') {
    return `${head}${n}×${fa.bolt}${recessStr}`;
  }
  return `${head}${n}×Ø${fmtN(holeD)}${recessStr}`;
}

export function layerTabDesc(s: SpacerState, kind: LayerKind): string {
  const fa = fastFor(s, kind);
  const n = kind === 'door' ? s.doorN : s.spkN;
  const slots = kind === 'door' ? s.doorSlots : s.spkSlots;
  const holeD = kind === 'door' ? s.doorHoleD : s.spkHoleD;
  const head = slots ? 'паз ' : '';
  const sym = !fa.active ? '' : fa.recessType === 'csk' ? ' ⌵' : ' ⌴';
  if (fa.bolt !== 'custom') {
    return `${head}${n}×${fa.bolt}${sym}`;
  }
  return `${head}${n}×Ø${fmtN(holeD)}${sym}`;
}

export function buildFileBase(s: SpacerState): string {
  const s1 = s.doorBolt !== 'custom' ? s.doorBolt : s.doorHoleD;
  const s2 = s.spkBolt !== 'custom' ? s.spkBolt : s.spkHoleD;
  return `prostavka_D${Math.round(s.outerD)}x${Math.round(s.thick)}_S1-${s.doorBCD}-${s.doorN}x${s1}_S2-${s.spkBCD}-${s.spkN}x${s2}`;
}

export function buildDXF(s: SpacerState, a: AnalysisResult): string {
  const L: string[] = [];
  const push = (...pr: (string | number)[]) => {
    for (let i = 0; i < pr.length; i += 2) {
      L.push(String(pr[i]));
      L.push(String(pr[i + 1]));
    }
  };
  const fN = (v: number) => +v.toFixed(3);
  push(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1, 0, 'ENDSEC');
  push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 6);
  (
    [
      ['CONTOUR', 7],
      ['CUTOUT', 8],
      ['DOOR', 5],
      ['SPEAKER', 30],
      ['CBORE', 3],
      ['CSINK', 4],
    ] as const
  ).forEach((l) => push(0, 'LAYER', 2, l[0], 70, 0, 62, l[1], 6, 'CONTINUOUS'));
  push(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  const circle = (lay: string, x: number, y: number, r: number) =>
    push(0, 'CIRCLE', 8, lay, 10, fN(x), 20, fN(y), 30, 0, 40, fN(r));
  const poly = (lay: string, pts: Point2D[]) => {
    push(0, 'POLYLINE', 8, lay, 66, 1, 70, 1, 10, 0, 20, 0, 30, 0);
    pts.forEach((p) => push(0, 'VERTEX', 8, lay, 10, fN(p[0]), 20, fN(p[1]), 30, 0));
    push(0, 'SEQEND', 8, lay);
  };
  if (s.ears) poly('CONTOUR', a.oPts);
  else circle('CONTOUR', 0, 0, s.outerD / 2);
  if (a.cutValid) circle('CUTOUT', 0, 0, s.innerD / 2);
  a.holes.forEach((h) => {
    if (!h.valid) return;
    const lay = h.kind === 'door' ? 'DOOR' : 'SPEAKER';
    if (h.type === 'circle') circle(lay, h.cx, h.cy, h.r);
    else poly(lay, h.pts);
    if (h.cbDepth > 0) {
      const recessLay = h.recessType === 'csk' ? 'CSINK' : 'CBORE';
      if (h.type === 'circle') circle(recessLay, h.cx, h.cy, h.cbR);
      else if (h.cbPts) poly(recessLay, h.cbPts);
    }
  });
  push(0, 'ENDSEC', 0, 'EOF');
  return L.join('\n') + '\n';
}

function modPos(v: number, m: number): number {
  return ((v % m) + m) % m;
}

function angDiffSigned(a: number, b: number): number {
  return modPos(a - b + 180, 360) - 180;
}

function circularModDist(v: number, m: number): number {
  const r = modPos(v, m);
  return Math.min(r, m - r);
}

/**
 * Returns true when two regular hole counts can interlock with uniform equal
 * angular spacing around the circle by rotation alone (one count divides the other).
 */
export function areLayerCountsCompatible(nA: number, nB: number): boolean {
  const a = Math.max(1, Math.round(nA));
  const b = Math.max(1, Math.round(nB));
  return a % b === 0 || b % a === 0;
}

type HoleAngleState = Pick<
  SpacerState,
  'doorN' | 'doorRot' | 'doorAutoSpace' | 'doorSlots' | 'slotAngle' | 'spkN' | 'spkRot' | 'spkSlots' | 'spkSlotAngle'
>;

/**
 * Returns the hole center angles in degrees [0, 360) for a given layer.
 * Speaker holes (Layer 2) always use exact equal spacing (360° / N) to match rigid speaker baskets.
 * Door holes (Layer 1) use exact equal spacing when `doorAutoSpace` is off or counts are compatible,
 * and smoothly rebalance into the open arcs between Layer 2 holes when `doorAutoSpace` is enabled
 * for incompatible counts (e.g. 5 door vs 4 speaker), avoiding tight crowding while preserving symmetry.
 */
export function layerHoleAnglesDeg(s: HoleAngleState, kind: LayerKind): number[] {
  const isDoor = kind === 'door';
  const nA = Math.max(1, Math.round(isDoor ? s.doorN : s.spkN));
  const rotA = modPos(isDoor ? s.doorRot : s.spkRot, 360);
  const stepA = 360 / nA;
  const regular: number[] = [];
  for (let i = 0; i < nA; i++) {
    regular.push(modPos(rotA + i * stepA, 360));
  }

  if (!isDoor || !s.doorAutoSpace) {
    return regular;
  }

  const nB = Math.max(1, Math.round(s.spkN));
  if (areLayerCountsCompatible(nA, nB)) {
    return regular;
  }

  const rotB = modPos(s.spkRot, 360);
  const stepB = 360 / nB;
  const fixed: number[] = [];
  for (let j = 0; j < nB; j++) {
    fixed.push(modPos(rotB + j * stepB, 360));
  }
  fixed.sort((a, b) => a - b);

  const halfA = s.doorSlots ? s.slotAngle / 2 : 0;
  const halfB = s.spkSlots ? s.spkSlotAngle / 2 : 0;
  const avgPitch = 360 / (nA + nB);
  // Realistic cross-layer clearance target paired with a minimum same-layer spacing floor
  // so mounting ears stay close to a clean regular polygon and never bunch into twin ears.
  const targetCross = Math.min(stepB * 0.4, avgPitch * 0.55) + halfA + halfB;
  const minSameGap = stepA * 0.78;

  const nodes = regular.map((a) => ({ a, b: a })).sort((p, q) => p.a - q.a);

  let baseMinCross = 180;
  for (const p of nodes) {
    for (const f of fixed) {
      const d = Math.abs(angDiffSigned(p.a, f));
      if (d < baseMinCross) baseMinCross = d;
    }
  }
  if (baseMinCross >= targetCross - 0.1) {
    return regular;
  }

  const forces = new Array<number>(nA);
  for (let it = 0; it < 500; it++) {
    for (let i = 0; i < nA; i++) {
      const prev = nodes[(i - 1 + nA) % nA];
      const next = nodes[(i + 1) % nA];
      const gapPrev = modPos(nodes[i].a - prev.a, 360) || 360;
      const gapNext = modPos(next.a - nodes[i].a, 360) || 360;
      let f = 0.25 * (gapNext - gapPrev) + 0.04 * angDiffSigned(nodes[i].b, nodes[i].a);

      if (gapPrev < minSameGap) {
        f += ((minSameGap - gapPrev) / stepA) * 30;
      }
      if (gapNext < minSameGap) {
        f -= ((minSameGap - gapNext) / stepA) * 30;
      }

      for (let j = 0; j < nB; j++) {
        const d = angDiffSigned(nodes[i].a, fixed[j]);
        const ad = Math.abs(d);
        if (ad < targetCross) {
          const sign = d > 1e-6 ? 1 : d < -1e-6 ? -1 : i % 2 === 0 ? 1 : -1;
          const push = Math.pow((targetCross - ad) / Math.max(1, targetCross), 1.3) * 22;
          f += sign * push;
        }
      }
      forces[i] = f;
    }

    const lr = 0.3 * Math.pow(0.995, it);
    for (let i = 0; i < nA; i++) {
      const step = clamp(forces[i] * lr, -2.5, 2.5);
      nodes[i].a = modPos(nodes[i].a + step, 360);
    }
    nodes.sort((p, q) => p.a - q.a);
  }

  return nodes.map((p) => {
    const rounded = modPos(Math.round(p.a * 2) / 2, 360);
    return rounded >= 360 ? 0 : rounded;
  });
}

/** Returns true when Layer 1 adaptive spacing is actively shifting holes away from rigid 360°/N. */
export function isDoorAutoShifted(s: HoleAngleState): boolean {
  if (!s.doorAutoSpace || areLayerCountsCompatible(s.doorN, s.spkN)) return false;
  const n = Math.max(1, Math.round(s.doorN));
  const step = 360 / n;
  const regular = Array.from({ length: n }, (_, i) => modPos(s.doorRot + i * step, 360)).sort((a, b) => a - b);
  const actual = [...layerHoleAnglesDeg(s, 'door')].sort((a, b) => a - b);
  for (let i = 0; i < n; i++) {
    if (Math.abs(angDiffSigned(actual[i], regular[i])) > 0.25) return true;
  }
  return false;
}

/** Computes the actual minimum angular clearance (degrees, accounting for slots & auto-spacing) between Layer 1 and Layer 2. */
export function minActualCrossLayerGapDeg(s: HoleAngleState): number {
  const aDoor = layerHoleAnglesDeg(s, 'door');
  const aSpk = layerHoleAnglesDeg(s, 'spk');
  const halfD = s.doorSlots ? s.slotAngle / 2 : 0;
  const halfS = s.spkSlots ? s.spkSlotAngle / 2 : 0;
  let minGap = 180;
  for (const ad of aDoor) {
    for (const as of aSpk) {
      const gap = Math.abs(angDiffSigned(ad, as)) - halfD - halfS;
      if (gap < minGap) minGap = gap;
    }
  }
  return +Math.max(0, minGap).toFixed(1);
}

function minCrossLayerGapDeg(
  nA: number,
  rotA: number,
  halfA: number,
  nB: number,
  rotB: number,
  halfB: number
): number {
  const stepA = 360 / nA;
  const stepB = 360 / nB;
  let minGap = 180;
  for (let i = 0; i < nA; i++) {
    const a = modPos(rotA + i * stepA, 360);
    for (let j = 0; j < nB; j++) {
      const b = modPos(rotB + j * stepB, 360);
      const d = Math.abs(a - b);
      const angDist = Math.min(d, 360 - d);
      const gap = angDist - halfA - halfB;
      if (gap < minGap) minGap = gap;
    }
  }
  return minGap;
}

function rotationSymmetryScores(rot: number, n: number): { yErr: number; xErr: number } {
  const period = 360 / n;
  // Bilateral reflection across vertical Y-axis (90°/270°): 2*rot ≡ 180 (mod period)
  const yErr = circularModDist(2 * rot - 180, period) / 2;
  // Bilateral reflection across horizontal X-axis (0°/180°): 2*rot ≡ 0 (mod period)
  const xErr = circularModDist(2 * rot, period) / 2;
  return { yErr, xErr };
}

/**
 * Computes the optimal rotation angle (in degrees, [0, 360)) for `kind` so its
 * holes distribute as uniformly and symmetrically as possible with respect to
 * the opposite layer (maximizing minimum angular clearance, then preferring
 * vertical/horizontal bilateral symmetry and minimal jump from current angle).
 */
export function optimalLayerRotation(
  s: Pick<
    SpacerState,
    'doorN' | 'doorRot' | 'doorSlots' | 'slotAngle' | 'spkN' | 'spkRot' | 'spkSlots' | 'spkSlotAngle'
  >,
  kind: LayerKind
): number {
  const isDoor = kind === 'door';
  const nA = Math.max(1, Math.round(isDoor ? s.doorN : s.spkN));
  const curRot = modPos(isDoor ? s.doorRot : s.spkRot, 360);
  const halfA = (isDoor ? s.doorSlots : s.spkSlots) ? (isDoor ? s.slotAngle : s.spkSlotAngle) / 2 : 0;

  const nB = Math.max(1, Math.round(isDoor ? s.spkN : s.doorN));
  const rotB = modPos(isDoor ? s.spkRot : s.doorRot, 360);
  const halfB = (isDoor ? s.spkSlots : s.doorSlots) ? (isDoor ? s.spkSlotAngle : s.slotAngle) / 2 : 0;

  const period = 360 / nA;
  const curMod = modPos(curRot, period);

  interface Cand {
    rot: number;
    minGap: number;
    yErr: number;
    xErr: number;
    isInt: boolean;
    distCur: number;
  }

  let best: Cand | null = null;
  const steps = Math.round(period * 2); // 0.5° resolution captures exact 22.5° for 8-hole patterns

  const isBetter = (a: Cand, b: Cand): boolean => {
    // 1. Maximize minimum cross-layer angular separation
    if (Math.abs(a.minGap - b.minGap) > 0.15) return a.minGap > b.minGap;
    // 2. Prefer exact vertical (left-right) mirror symmetry
    if (Math.abs(a.yErr - b.yErr) > 0.15) return a.yErr < b.yErr;
    // 3. Prefer horizontal mirror symmetry
    if (Math.abs(a.xErr - b.xErr) > 0.15) return a.xErr < b.xErr;
    // 4. Prefer clean integer degrees when accuracy is tied
    if (a.isInt !== b.isInt) return a.isInt;
    // 5. Minimal angular change from current rotation
    return a.distCur < b.distCur;
  };

  for (let k = 0; k < steps; k++) {
    const r = +(k * 0.5).toFixed(1);
    const minGap = minCrossLayerGapDeg(nA, r, halfA, nB, rotB, halfB);
    const { yErr, xErr } = rotationSymmetryScores(r, nA);
    const cand: Cand = {
      rot: r,
      minGap,
      yErr,
      xErr,
      isInt: Math.abs(r - Math.round(r)) < 1e-6,
      distCur: circularModDist(r - curMod, period),
    };
    if (!best || isBetter(cand, best)) {
      best = cand;
    }
  }

  if (!best) return curRot;

  // Keep current angle unchanged if it already matches the optimal hole pattern
  const curGap = minCrossLayerGapDeg(nA, curRot, halfA, nB, rotB, halfB);
  const curSym = rotationSymmetryScores(curRot, nA);
  if (
    Math.abs(curGap - best.minGap) <= 0.15 &&
    Math.abs(curSym.yErr - best.yErr) <= 0.15 &&
    Math.abs(curSym.xErr - best.xErr) <= 0.15
  ) {
    return +curRot.toFixed(1);
  }

  // Pick the periodic equivalent of best.rot closest to curRot (staying in [0, 359.5])
  let chosen = best.rot;
  let bestDelta = 360;
  for (let i = 0; i < nA; i++) {
    const eq = +modPos(best.rot + i * period, 360).toFixed(1);
    const d = circularModDist(eq - curRot, 360);
    if (d < bestDelta - 1e-6 || (Math.abs(d - bestDelta) <= 1e-6 && eq < chosen)) {
      bestDelta = d;
      chosen = eq;
    }
  }
  return chosen >= 360 ? 0 : chosen;
}

function closestPeriodicEquiv(baseRot: number, n: number, curRot: number): number {
  const period = 360 / n;
  let chosen = modPos(Math.round(baseRot * 2) / 2, 360);
  let bestDelta = 360;
  for (let i = 0; i < n; i++) {
    const raw = modPos(baseRot + i * period, 360);
    const eq = modPos(Math.round(raw * 2) / 2, 360);
    const d = circularModDist(eq - curRot, 360);
    if (d < bestDelta - 1e-6 || (Math.abs(d - bestDelta) <= 1e-6 && eq < chosen)) {
      bestDelta = d;
      chosen = eq;
    }
  }
  return chosen >= 360 ? 0 : +chosen.toFixed(1);
}

/**
 * Computes coordinated optimal rotations for Layer 1 & Layer 2 when changing `kind`.
 * When `doorAutoSpace` is active on incompatible counts (e.g. 6 door vs 5 speaker),
 * keeps both layers aligned to exact vertical Y-axis mirror symmetry (avoiding off-axis
 * tilts like 48° on 6×5) while maximizing clearance between their symmetry phases.
 */
export function optimalLayerPairRotations(
  s: HoleAngleState,
  kind: LayerKind
): { doorRot: number; spkRot: number } {
  const nD = Math.max(1, Math.round(s.doorN));
  const nS = Math.max(1, Math.round(s.spkN));
  const halfD = s.doorSlots ? s.slotAngle / 2 : 0;
  const halfS = s.spkSlots ? s.spkSlotAngle / 2 : 0;

  if (!s.doorAutoSpace || areLayerCountsCompatible(nD, nS)) {
    const opt = optimalLayerRotation(s, kind);
    return kind === 'door' ? { doorRot: opt, spkRot: s.spkRot } : { doorRot: s.doorRot, spkRot: opt };
  }

  // Incompatible counts with adaptive door spacing enabled:
  // Always keep both layers upright Y-symmetric (90° / 270° mirror axis).
  const spkPhases = [modPos(90 + 180 / nS, 360), 90];
  const doorPhases = [90, modPos(90 + 180 / nD, 360)];

  let spkRot = s.spkRot;
  if (kind === 'spk') {
    // Prefer gap centered at top (e.g. 45° for 4, 54° for 5, 0°/60° for 6, 22.5° for 8)
    spkRot = closestPeriodicEquiv(spkPhases[0], nS, s.spkRot);
  }

  // Pick whichever Y-symmetric door phase avoids overlapping a speaker hole on the Y-axis
  const doorCands = doorPhases.map((p) => {
    const eq = closestPeriodicEquiv(p, nD, s.doorRot);
    const gap = minCrossLayerGapDeg(nD, eq, halfD, nS, spkRot, halfS);
    const dist = circularModDist(eq - s.doorRot, 360);
    return { eq, gap, dist };
  });
  doorCands.sort((a, b) => {
    if (Math.abs(a.gap - b.gap) > 0.25) return b.gap - a.gap;
    return a.dist - b.dist;
  });
  const doorRot = doorCands[0].eq;

  return { doorRot, spkRot };
}

/** Returns true when `kind`'s current rotation is already maximally uniform & symmetric against the other layer. */
export function isLayerRotationOptimal(
  s: Pick<
    SpacerState,
    'doorN' | 'doorRot' | 'doorSlots' | 'slotAngle' | 'spkN' | 'spkRot' | 'spkSlots' | 'spkSlotAngle'
  > & { doorAutoSpace?: boolean },
  kind: LayerKind
): boolean {
  const isDoor = kind === 'door';
  const nA = Math.max(1, Math.round(isDoor ? s.doorN : s.spkN));
  const curRot = modPos(isDoor ? s.doorRot : s.spkRot, 360);
  const halfA = (isDoor ? s.doorSlots : s.spkSlots) ? (isDoor ? s.slotAngle : s.spkSlotAngle) / 2 : 0;
  const nB = Math.max(1, Math.round(isDoor ? s.spkN : s.doorN));
  const rotB = modPos(isDoor ? s.spkRot : s.doorRot, 360);
  const halfB = (isDoor ? s.spkSlots : s.doorSlots) ? (isDoor ? s.spkSlotAngle : s.slotAngle) / 2 : 0;

  if (s.doorAutoSpace && !areLayerCountsCompatible(s.doorN, s.spkN)) {
    const curSym = rotationSymmetryScores(curRot, nA);
    if (curSym.yErr > 0.4) return false;
    const pair = optimalLayerPairRotations({ ...s, doorAutoSpace: true }, kind);
    const curGap = minCrossLayerGapDeg(s.doorN, s.doorRot, s.doorSlots ? s.slotAngle / 2 : 0, s.spkN, s.spkRot, s.spkSlots ? s.spkSlotAngle / 2 : 0);
    const optGap = minCrossLayerGapDeg(s.doorN, pair.doorRot, s.doorSlots ? s.slotAngle / 2 : 0, s.spkN, pair.spkRot, s.spkSlots ? s.spkSlotAngle / 2 : 0);
    return curGap >= optGap - 0.4;
  }

  const opt = optimalLayerRotation(s, kind);
  const curGap = minCrossLayerGapDeg(nA, curRot, halfA, nB, rotB, halfB);
  const optGap = minCrossLayerGapDeg(nA, opt, halfA, nB, rotB, halfB);
  const curSym = rotationSymmetryScores(curRot, nA);
  const optSym = rotationSymmetryScores(opt, nA);

  return Math.abs(curGap - optGap) <= 0.25 && Math.abs(curSym.yErr - optSym.yErr) <= 0.25;
}
