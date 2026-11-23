import { t } from '../i18n';
import type {
  BoltSize,
  BoltSpec,
  MaterialDef,
  MaterialId,
  PresetDef,
  QualityMode,
  RecessMode,
  SceneBgMode,
  SpacerState,
} from './types';

export const MATS: Record<MaterialId, MaterialDef> = {
  mdf: { name: t('МДФ'), shortName: t('МДФ'), color: '#c9a06b', rough: 0.92, metal: 0.02, env: 0.4, tex: 'wood' },
  fanera: {
    name: t('Фанера берёзовая'),
    shortName: t('Фанера'),
    color: '#d8b47e',
    rough: 0.85,
    metal: 0.02,
    env: 0.45,
    tex: 'ply',
  },
  abs: { name: t('ABS-пластик'), shortName: 'ABS', color: '#39414b', rough: 0.5, metal: 0.08, env: 0.7, tex: 'noise' },
  alu: {
    name: t('Алюминий'),
    shortName: t('Алюм.'),
    color: '#b9c5d0',
    rough: 0.32,
    metal: 0.92,
    env: 1.1,
    tex: 'brush',
  },
};

export const BOLTS: Record<Exclude<BoltSize, 'custom'>, BoltSpec> = {
  M3: { d: 3, dk: 5.5, k: 3, hex: 2.5, clear: 3.4, cskDk: 6 },
  M4: { d: 4, dk: 7, k: 4, hex: 3, clear: 4.5, cskDk: 8 },
  M5: { d: 5, dk: 8.5, k: 5, hex: 4, clear: 5.5, cskDk: 10 },
  M6: { d: 6, dk: 10, k: 6, hex: 5, clear: 6.6, cskDk: 12 },
  M8: { d: 8, dk: 13, k: 8, hex: 6, clear: 9, cskDk: 16 },
  M10: { d: 10, dk: 16, k: 10, hex: 8, clear: 11, cskDk: 20 },
};

export const BOLT_OPTS: [BoltSize, string][] = [
  ['custom', t('Своё отверстие (ручной диаметр)')],
  ['M3', t('Болт M3 (отверстие Ø3,4 мм)')],
  ['M4', t('Болт M4 (отверстие Ø4,5 мм)')],
  ['M5', t('Болт M5 (отверстие Ø5,5 мм)')],
  ['M6', t('Болт M6 (отверстие Ø6,6 мм)')],
  ['M8', t('Болт M8 (отверстие Ø9,0 мм)')],
  ['M10', t('Болт M10 (отверстие Ø11,0 мм)')],
];

export const RECESS_OPTS: [RecessMode, string][] = [
  ['none', t('Без углубления (головка снаружи)')],
  ['flush', t('Цековка · цилиндр под головку (заподлицо)')],
  ['deep', t('Цековка · утопленная глубже (+1 мм)')],
  ['csk', t('Зенковка 90° · конус впотай')],
  ['csk_deep', t('Зенковка 90° · конус глубже (+0,5 мм)')],
];

export const CUSTOM_RECESS_OPTS: [RecessMode, string][] = [
  ['none', t('Без углубления (головка снаружи)')],
  ['csk', t('Зенковка 90° · конус под саморез')],
  ['csk_deep', t('Зенковка 90° · конус глубже (+0,5 мм)')],
];

export const MATERIAL_OPTS: [MaterialId, string][] = [
  ['mdf', t('МДФ (MDF)')],
  ['fanera', t('Фанера берёзовая')],
  ['abs', t('ABS-пластик (3D-печать)')],
  ['alu', t('Алюминий (ЧПУ)')],
];

export const QUALITY_OPTS: [QualityMode, string][] = [
  ['draft', t('Черновик')],
  ['std', t('Стандарт')],
  ['high', t('Высокое')],
];

export const BG_OPTS: [SceneBgMode, string][] = [
  ['light', t('Светлый чертёжный')],
  ['gray', t('Нейтральный серый')],
  ['dark', t('Тёмная студия')],
];

export const DEFAULTS: SpacerState = {
  outerD: 180,
  innerD: 146,
  thick: 16,
  chamfer: true,

  doorBCD: 168,
  doorN: 3,
  doorHoleD: 5.5,
  doorRot: 90,
  doorAutoSpace: true,
  doorSlots: false,
  slotAngle: 18,
  ears: true,
  earMargin: 6,
  doorBolt: 'M5',
  doorRecess: 'flush',
  doorHeadClear: 0.5,

  spkBCD: 158,
  spkN: 4,
  spkHoleD: 4.2,
  spkRot: 45,
  spkSlots: false,
  spkSlotAngle: 14,
  spkBolt: 'custom',
  spkRecess: 'none',
  spkHeadClear: 0.5,

  material: 'fanera',
  tint: '#ffffff',
  sceneBg: 'light',
  quality: 'std',
  grid: true,
  edges: true,
  autoRotate: false,
  rotSpeed: 0.6,
  showDims: true,

  view: '3d',
};

export const STD_RANGES = {
  outerD: [120, 260] as [number, number],
  innerD: [80, 230] as [number, number],
  thick: [3, 30] as [number, number],
  doorBCD: [90, 250] as [number, number],
  spkBCD: [90, 240] as [number, number],
};

export const WIDE_RANGES = {
  outerD: [50, 500] as [number, number],
  innerD: [25, 470] as [number, number],
  thick: [3, 80] as [number, number],
  doorBCD: [35, 490] as [number, number],
  spkBCD: [35, 490] as [number, number],
};

export function isOutsideStdRange(s: Pick<SpacerState, 'outerD' | 'innerD' | 'thick' | 'doorBCD' | 'spkBCD'>): boolean {
  return (
    s.outerD < STD_RANGES.outerD[0] ||
    s.outerD > STD_RANGES.outerD[1] ||
    s.innerD < STD_RANGES.innerD[0] ||
    s.innerD > STD_RANGES.innerD[1] ||
    s.thick > STD_RANGES.thick[1] ||
    s.doorBCD < STD_RANGES.doorBCD[0] ||
    s.doorBCD > STD_RANGES.doorBCD[1] ||
    s.spkBCD < STD_RANGES.spkBCD[0] ||
    s.spkBCD > STD_RANGES.spkBCD[1]
  );
}

export const LIMITS: Partial<Record<keyof SpacerState, [number, number]>> = {
  outerD: WIDE_RANGES.outerD,
  innerD: WIDE_RANGES.innerD,
  thick: WIDE_RANGES.thick,
  doorBCD: WIDE_RANGES.doorBCD,
  doorN: [2, 8],
  doorHoleD: [2.5, 12],
  doorRot: [0, 359.5],
  slotAngle: [6, 40],
  earMargin: [4, 16],
  spkBCD: WIDE_RANGES.spkBCD,
  spkN: [2, 8],
  spkHoleD: [2.5, 12],
  spkRot: [0, 359.5],
  spkSlotAngle: [6, 40],
  rotSpeed: [0, 2],
  doorHeadClear: [0.2, 1.5],
  spkHeadClear: [0.2, 1.5],
};

export const PRESETS: PresetDef[] = [
  { name: t('Универсал 16,5 см'), meta: t('Ø180 · M5 ⌴ / 4×Ø4,2'), p: {} },
  {
    name: t('ВАЗ 2110 · дверь'),
    meta: 'Ø176 · M5 ⌴ / 4×Ø4',
    p: {
      outerD: 176,
      innerD: 141,
      thick: 18,
      doorBCD: 163,
      doorN: 3,
      doorHoleD: 5.5,
      doorRot: 90,
      doorAutoSpace: false,
      doorSlots: false,
      ears: false,
      doorBolt: 'M5',
      doorRecess: 'flush',
      doorHeadClear: 0.5,
      spkBCD: 154,
      spkN: 4,
      spkHoleD: 4,
      spkRot: 45,
      spkSlots: false,
      spkBolt: 'custom',
      spkRecess: 'none',
      material: 'fanera',
      chamfer: true,
    },
  },
  {
    name: t('Kia Rio · 16,5 см'),
    meta: t('Ø184 · M6 пазы / 4×Ø4,2'),
    p: {
      outerD: 184,
      innerD: 146,
      thick: 12,
      doorBCD: 176,
      doorN: 3,
      doorHoleD: 6.6,
      doorRot: 90,
      doorAutoSpace: false,
      doorSlots: true,
      slotAngle: 18,
      ears: true,
      earMargin: 6,
      doorBolt: 'M6',
      doorRecess: 'flush',
      doorHeadClear: 0.6,
      spkBCD: 158,
      spkN: 4,
      spkHoleD: 4.2,
      spkRot: 45,
      spkSlots: false,
      spkBolt: 'custom',
      spkRecess: 'none',
      material: 'fanera',
      chamfer: true,
    },
  },
  {
    name: 'VAG · Golf IV',
    meta: 'Ø180 · M4 ⌴ / M4 ⌴',
    p: {
      outerD: 180,
      innerD: 145,
      thick: 14,
      doorBCD: 171,
      doorN: 4,
      doorHoleD: 4.5,
      doorRot: 45,
      doorSlots: false,
      ears: true,
      earMargin: 5,
      doorBolt: 'M4',
      doorRecess: 'flush',
      doorHeadClear: 0.4,
      spkBCD: 158,
      spkN: 4,
      spkHoleD: 4.5,
      spkRot: 0,
      spkSlots: false,
      spkBolt: 'M4',
      spkRecess: 'flush',
      spkHeadClear: 0.4,
      material: 'abs',
      chamfer: false,
    },
  },
  {
    name: t('СЧ 13 см · 5,25"'),
    meta: t('Ø146 · M4 ⌴ / 4×Ø3,5'),
    p: {
      outerD: 146,
      innerD: 116,
      thick: 8,
      doorBCD: 136,
      doorN: 3,
      doorHoleD: 4.5,
      doorRot: 90,
      doorAutoSpace: false,
      doorSlots: false,
      ears: true,
      earMargin: 5,
      doorBolt: 'M4',
      doorRecess: 'flush',
      doorHeadClear: 0.4,
      spkBCD: 126,
      spkN: 4,
      spkHoleD: 3.5,
      spkRot: 45,
      spkSlots: false,
      spkBolt: 'custom',
      spkRecess: 'none',
      material: 'fanera',
      chamfer: true,
    },
  },
  {
    name: t('20 см · УАЗ / ГАЗель'),
    meta: 'Ø232 · M8 ⌴ / M5 ⌴',
    p: {
      outerD: 232,
      innerD: 183,
      thick: 22,
      doorBCD: 220,
      doorN: 4,
      doorHoleD: 9,
      doorRot: 45,
      doorSlots: true,
      slotAngle: 16,
      ears: true,
      earMargin: 7,
      doorBolt: 'M8',
      doorRecess: 'deep',
      doorHeadClear: 0.8,
      spkBCD: 197,
      spkN: 4,
      spkHoleD: 5.5,
      spkRot: 45,
      spkSlots: false,
      spkBolt: 'M5',
      spkRecess: 'flush',
      spkHeadClear: 0.5,
      material: 'fanera',
      chamfer: true,
    },
  },
];

export const QUALITY_PARAMS = {
  draft: { pr: 0.8, seg: 40, out: 360, shadow: 1024 },
  std: { pr: 1.5, seg: 64, out: 720, shadow: 1024 },
  high: { pr: 2, seg: 96, out: 1200, shadow: 2048 },
} as const;
