import { t } from '../i18n';
import type { LayerKind, PanelMode, SpacerState, WizardStepId } from './types';

export interface WizardStepDef {
  id: WizardStepId;
  shortLabel: string;
  title: string;
  subtitle: string;
  nextLabel: string;
}

export interface QuickSizeDef {
  id: '13cm' | '16cm' | '20cm';
  label: string;
  inch: string;
  dims: string;
  patch: Partial<SpacerState>;
}

export const WIZARD_STEPS: readonly WizardStepDef[] = [
  {
    id: 'ring',
    shortLabel: t('Кольцо'),
    title: t('Размеры кольца'),
    subtitle: t('Выберите типоразмер динамика и задайте габариты проставки.'),
    nextLabel: t('Далее'),
  },
  {
    id: 'door',
    shortLabel: t('Дверь'),
    title: t('Крепление к двери'),
    subtitle: t('Настройте отверстия крепления проставки к металлу двери, болты и ушки.'),
    nextLabel: t('Далее'),
  },
  {
    id: 'spk',
    shortLabel: t('Динамик'),
    title: t('Крепление динамика'),
    subtitle: t('Задайте отверстия или пазы под крепление корзины динамика.'),
    nextLabel: t('Далее'),
  },
  {
    id: 'export',
    shortLabel: t('Экспорт'),
    title: t('Изготовление и экспорт'),
    subtitle: t('Выберите способ изготовления и скачайте 3D-модель или чертёж.'),
    nextLabel: t('Готово'),
  },
] as const;

export const QUICK_SIZES: readonly QuickSizeDef[] = [
  {
    id: '13cm',
    label: t('13 см'),
    inch: t('5,25"'),
    dims: t('146 / 116 мм'),
    patch: {
      outerD: 146,
      innerD: 116,
      thick: 12,
      doorBCD: 136,
      doorN: 3,
      doorBolt: 'M4',
      doorHoleD: 4.5,
      doorRecess: 'flush',
      doorHeadClear: 0.4,
      ears: true,
      earMargin: 5,
      spkBCD: 126,
      spkN: 4,
      spkBolt: 'custom',
      spkHoleD: 3.5,
      spkRecess: 'none',
    },
  },
  {
    id: '16cm',
    label: t('16,5 см'),
    inch: t('6,5"'),
    dims: t('180 / 146 мм'),
    patch: {
      outerD: 180,
      innerD: 146,
      thick: 16,
      doorBCD: 168,
      doorN: 3,
      doorBolt: 'M5',
      doorHoleD: 5.5,
      doorRecess: 'flush',
      doorHeadClear: 0.5,
      ears: true,
      earMargin: 6,
      spkBCD: 158,
      spkN: 4,
      spkBolt: 'custom',
      spkHoleD: 4.2,
      spkRecess: 'none',
    },
  },
  {
    id: '20cm',
    label: t('20 см'),
    inch: '8"',
    dims: t('232 / 183 мм'),
    patch: {
      outerD: 232,
      innerD: 183,
      thick: 20,
      doorBCD: 220,
      doorN: 4,
      doorRot: 0,
      doorBolt: 'M6',
      doorHoleD: 6.6,
      doorRecess: 'flush',
      doorHeadClear: 0.6,
      ears: true,
      earMargin: 7,
      spkBCD: 200,
      spkN: 4,
      spkRot: 45,
      spkBolt: 'M5',
      spkHoleD: 5.5,
      spkRecess: 'flush',
      spkHeadClear: 0.5,
    },
  },
] as const;

export function clampWizardStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(WIZARD_STEPS.length - 1, Math.trunc(step)));
}

export function nextWizardStep(step: number): { done: boolean; step: number } {
  const cur = clampWizardStep(step);
  if (cur >= WIZARD_STEPS.length - 1) {
    return { done: true, step: cur };
  }
  return { done: false, step: cur + 1 };
}

export function prevWizardStep(step: number): number {
  return clampWizardStep(clampWizardStep(step) - 1);
}

export function wizardStepForLayer(layer: LayerKind): number {
  return layer === 'door' ? 1 : 2;
}

export function detectQuickSizeId(state: Pick<SpacerState, 'outerD' | 'innerD'>): QuickSizeDef['id'] | null {
  for (const q of QUICK_SIZES) {
    if (
      q.patch.outerD !== undefined &&
      q.patch.innerD !== undefined &&
      Math.abs(state.outerD - q.patch.outerD) <= 1 &&
      Math.abs(state.innerD - q.patch.innerD) <= 1
    ) {
      return q.id;
    }
  }
  return null;
}

export function resolveInitialPanelMode(savedMode: unknown, search = ''): PanelMode {
  const params = new URLSearchParams(search);
  const queryMode = params.get('mode');
  if (queryMode === 'edit' || params.get('autostart') === '1') {
    return 'edit';
  }
  if (queryMode === 'wizard') {
    return 'wizard';
  }
  if (savedMode === 'edit' || savedMode === 'wizard') {
    return savedMode;
  }
  return 'wizard';
}
