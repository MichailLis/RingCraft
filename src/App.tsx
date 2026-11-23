import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, ListChecks, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { CounterboreIcon, CountersinkIcon, DiameterIcon } from './components/CadIcons';
import { ControlPanel } from './components/ControlPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExportModal } from './components/ExportModal';
import { HeaderBar } from './components/HeaderBar';
import { InspectionDrawer } from './components/InspectionDrawer';
import { PresetsModal } from './components/PresetsModal';
import { ToastHost } from './components/ToastHost';
import { ViewCube, type ViewCubeHandle } from './components/ViewCube';
import { Viewport2D, type Viewport2DHandle } from './components/Viewport2D';
import { Viewport3D, type Viewport3DHandle } from './components/Viewport3D';
import { BOLTS, DEFAULTS, isOutsideStdRange } from './core/constants';
import {
  applyConstrainedPatch,
  applyRingResizeWithAutoFit,
  type ConstrainedField,
  type ConstraintJumpTarget,
  type ConstraintNotice,
} from './core/constraints';
import { analyze, buildDXF, buildFileBase, fmtN, sanitizeState } from './core/geometry';
import { readStored, STORAGE_KEYS, writeStored } from './core/storage';
import { clampWizardStep, resolveInitialPanelMode, wizardStepForLayer } from './core/wizard';
import type {
  DrawerTab,
  LayerKind,
  PresetDef,
  SavedPreset,
  SectionId,
  SpacerState,
  ToastAction,
  ToastItem,
  UIState,
} from './core/types';

function loadInitialState(): { state: SpacerState; restored: boolean } {
  return readStored<{ state: SpacerState; restored: boolean }>(
    localStorage,
    STORAGE_KEYS.state,
    (data) => ({ state: sanitizeState(data as Record<string, unknown>), restored: true }),
    {
      state: { ...DEFAULTS },
      restored: false,
    }
  );
}

const DEFAULT_OPEN: Record<SectionId, boolean> = {
  ring: true,
  door: false,
  spk: false,
  scene: false,
};

function loadInitialUI(): UIState {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const fallback: UIState = {
    mode: resolveInitialPanelMode(undefined, search),
    wizardStep: 0,
    open: { ...DEFAULT_OPEN },
    customRange: false,
  };
  return readStored(
    localStorage,
    STORAGE_KEYS.ui,
    (data) => {
      const p = data as {
        mode?: unknown;
        wizardStep?: unknown;
        open?: Partial<Record<SectionId, boolean>>;
        customRange?: unknown;
      };
      return {
        mode: resolveInitialPanelMode(p?.mode, search),
        wizardStep: typeof p?.wizardStep === 'number' ? clampWizardStep(p.wizardStep) : 0,
        open: {
          ring: typeof p?.open?.ring === 'boolean' ? p.open.ring : DEFAULT_OPEN.ring,
          door: typeof p?.open?.door === 'boolean' ? p.open.door : DEFAULT_OPEN.door,
          spk: typeof p?.open?.spk === 'boolean' ? p.open.spk : DEFAULT_OPEN.spk,
          scene: typeof p?.open?.scene === 'boolean' ? p.open.scene : DEFAULT_OPEN.scene,
        },
        customRange: typeof p?.customRange === 'boolean' ? p.customRange : false,
      };
    },
    fallback
  );
}

function loadSavedPresets(): SavedPreset[] {
  return readStored(
    localStorage,
    STORAGE_KEYS.saved,
    (data) => {
      if (!Array.isArray(data)) return [];
      return data
        .filter((x) => x && typeof x.name === 'string' && x.p && typeof x.p === 'object')
        .map((x) => ({ name: x.name, p: sanitizeState(x.p) }));
    },
    []
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function Viewport3DCrashed({ onFailed }: { onFailed: (ok: boolean) => void }) {
  useEffect(() => {
    onFailed(false);
  }, [onFailed]);
  return <div className="absolute inset-0" />;
}

export default function App() {
  const initial = useMemo(() => loadInitialState(), []);
  const [state, setState] = useState<SpacerState>(initial.state);
  const [ui, setUi] = useState<UIState>(loadInitialUI);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(loadSavedPresets);
  const [activePresetKey, setActivePresetKey] = useState<string | null>(initial.restored ? null : 'builtin:0');
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [ready3d, setReady3d] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [constraint, setConstraint] = useState<ConstraintNotice | null>(null);

  const vp3dRef = useRef<Viewport3DHandle>(null);
  const vp2dRef = useRef<Viewport2DHandle>(null);
  const viewCubeRef = useRef<ViewCubeHandle>(null);
  const stateRef = useRef(state);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref must be current during render so handlers never see stale state
  stateRef.current = state;
  const toastIdRef = useRef(1);
  const toastTimersRef = useRef<Map<number, number>>(new Map());

  const analysis = useMemo(() => analyze(state), [state]);

  const dismissToast = useCallback((id: number) => {
    const timer = toastTimersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    toastTimersRef.current.clear();
    setToasts([]);
  }, []);

  const openDrawer = useCallback(
    (tab: DrawerTab) => {
      if (tab) clearToasts();
      setDrawerTab(tab);
    },
    [clearToasts]
  );

  const pushToast = useCallback((msg: string, type: ToastItem['type'] = 'info', action: ToastAction | null = null) => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev.slice(-2), { id, msg, type, action }]);
    const timer = window.setTimeout(
      () => {
        toastTimersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      },
      action ? 6000 : 4200
    );
    toastTimersRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      writeStored(localStorage, STORAGE_KEYS.state, state);
    }, 350);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    writeStored(localStorage, STORAGE_KEYS.ui, ui);
  }, [ui]);

  useEffect(() => {
    writeStored(localStorage, STORAGE_KEYS.saved, savedPresets);
  }, [savedPresets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (exportOpen) {
        setExportOpen(false);
      } else if (presetsOpen) {
        setPresetsOpen(false);
      } else if (drawerTab) {
        setDrawerTab(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerTab, exportOpen, presetsOpen]);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const uiRef = useRef(ui);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref must be current during render so handlers never see stale state
  uiRef.current = ui;

  const [holesCustomized, setHolesCustomized] = useState(false);
  const holesCustomizedRef = useRef(holesCustomized);
  // eslint-disable-next-line react-hooks/refs -- latest-value ref must be current during render so handlers never see stale state
  holesCustomizedRef.current = holesCustomized;

  const autoFitHolesActive = ui.mode === 'wizard' && ui.wizardStep === 0 && !holesCustomized;

  const handlePatch = useCallback((patch: Partial<SpacerState>, field?: ConstrainedField) => {
    const isRingResizeField = field === 'outerD' || field === 'innerD' || field === 'thick';
    const useAutoFit =
      isRingResizeField &&
      uiRef.current.mode === 'wizard' &&
      uiRef.current.wizardStep === 0 &&
      !holesCustomizedRef.current;

    const res = useAutoFit
      ? applyRingResizeWithAutoFit(stateRef.current, patch, field, true)
      : applyConstrainedPatch(stateRef.current, patch, field);

    if (res.applied) {
      setActivePresetKey(null);
      setState(res.state);
      if (
        field &&
        (field.startsWith('door') ||
          field.startsWith('spk') ||
          field === 'ears' ||
          field === 'earMargin' ||
          field === 'slotAngle')
      ) {
        setHolesCustomized(true);
      }
      if (isOutsideStdRange(res.state) && !uiRef.current.customRange) {
        setUi((prev) => ({ ...prev, customRange: true }));
      }
    }
    setConstraint(res.notice);
  }, []);

  const handleSelectQuickSize = useCallback((patch: Partial<SpacerState>) => {
    const res = applyConstrainedPatch(stateRef.current, patch);
    if (res.applied) {
      setActivePresetKey(null);
      setState(res.state);
      setHolesCustomized(false);
      setUi((prev) => ({ ...prev, customRange: false }));
    }
    setConstraint(res.notice);
  }, []);

  const handleToggleCustomRange = useCallback(
    (wide: boolean) => {
      setConstraint(null);
      if (!wide && isOutsideStdRange(stateRef.current)) {
        pushToast('Текущие размеры шире 120–260 мм — сначала уменьшите их или оставьте произвольный режим', 'info');
        return;
      }
      if (wide && uiRef.current.mode === 'wizard' && uiRef.current.wizardStep === 0) {
        setHolesCustomized(false);
      }
      setUi((prev) => ({ ...prev, customRange: wide }));
    },
    [pushToast]
  );

  const handleAutoFitHoles = useCallback(
    (notice: ConstraintNotice) => {
      if (
        !notice.attemptedPatch ||
        (notice.field !== 'outerD' && notice.field !== 'innerD' && notice.field !== 'thick')
      ) {
        return;
      }
      const res = applyRingResizeWithAutoFit(stateRef.current, notice.attemptedPatch, notice.field, true);
      if (res.applied) {
        setActivePresetKey(null);
        setState(res.state);
        if (isOutsideStdRange(res.state) && !uiRef.current.customRange) {
          setUi((prev) => ({ ...prev, customRange: true }));
        }
        pushToast('Отверстия подстроены под новый размер кольца', 'ok');
      }
      setConstraint(res.notice);
    },
    [pushToast]
  );

  const handleSelectPreset = useCallback(
    (preset: PresetDef, key: string) => {
      const next = sanitizeState({
        ...DEFAULTS,
        ...preset.p,
        view: stateRef.current.view,
        quality: stateRef.current.quality,
        sceneBg: stateRef.current.sceneBg,
      });
      setState(next);
      setHolesCustomized(true);
      setUi((prev) => ({ ...prev, customRange: isOutsideStdRange(next) }));
      setConstraint(null);
      setActivePresetKey(key);
      pushToast(`Пресет применён: ${preset.name}`, 'ok');
    },
    [pushToast]
  );

  const handleSelectSaved = useCallback(
    (saved: SavedPreset, index: number) => {
      const next = sanitizeState({
        ...saved.p,
        view: stateRef.current.view,
      });
      setState(next);
      setHolesCustomized(true);
      setUi((prev) => ({ ...prev, customRange: isOutsideStdRange(next) }));
      setConstraint(null);
      setActivePresetKey(`saved:${index}`);
      pushToast(`Пресет применён: ${saved.name}`, 'ok');
    },
    [pushToast]
  );

  const handleSaveCurrent = useCallback(
    (name: string) => {
      const snap = { ...stateRef.current };
      setSavedPresets((prev) => {
        const next = [...prev, { name, p: snap }];
        setActivePresetKey(`saved:${next.length - 1}`);
        return next;
      });
      pushToast(`Пресет «${name}» сохранён`, 'ok');
    },
    [pushToast]
  );

  const handleDeleteSaved = useCallback(
    (index: number) => {
      setSavedPresets((prev) => {
        const removed = prev[index];
        if (!removed) return prev;
        const next = prev.filter((_, i) => i !== index);
        pushToast(`Пресет «${removed.name}» удалён`, 'warn', {
          label: 'Отменить',
          fn: () => {
            setSavedPresets((cur) => {
              const restored = [...cur];
              restored.splice(index, 0, removed);
              return restored;
            });
          },
        });
        return next;
      });
      setActivePresetKey(null);
    },
    [pushToast]
  );

  const handleCopyLayer = useCallback(
    (from: LayerKind) => {
      const s = stateRef.current;
      const prevSnapshot: Partial<SpacerState> = {
        doorBolt: s.doorBolt,
        doorRecess: s.doorRecess,
        doorHeadClear: s.doorHeadClear,
        doorHoleD: s.doorHoleD,
        doorSlots: s.doorSlots,
        slotAngle: s.slotAngle,
        spkBolt: s.spkBolt,
        spkRecess: s.spkRecess,
        spkHeadClear: s.spkHeadClear,
        spkHoleD: s.spkHoleD,
        spkSlots: s.spkSlots,
        spkSlotAngle: s.spkSlotAngle,
      };
      const patch: Partial<SpacerState> =
        from === 'door'
          ? {
              spkBolt: s.doorBolt,
              spkRecess: s.doorRecess,
              spkHeadClear: s.doorHeadClear,
              spkHoleD: s.doorBolt !== 'custom' ? BOLTS[s.doorBolt].clear : s.doorHoleD,
              spkSlots: s.doorSlots,
              spkSlotAngle: s.slotAngle,
            }
          : {
              doorBolt: s.spkBolt,
              doorRecess: s.spkRecess,
              doorHeadClear: s.spkHeadClear,
              doorHoleD: s.spkBolt !== 'custom' ? BOLTS[s.spkBolt].clear : s.spkHoleD,
              doorSlots: s.spkSlots,
              slotAngle: s.spkSlotAngle,
            };

      const res = applyConstrainedPatch(s, patch, 'copyLayer');
      if (res.clamped) {
        setConstraint(res.notice);
        return;
      }

      setConstraint(null);
      setActivePresetKey(null);
      setHolesCustomized(true);
      setState(res.state);
      const label = from === 'door' ? 'Дверь → Динамик' : 'Динамик → Дверь';
      pushToast(`Крепёж скопирован: ${label}`, 'ok', {
        label: 'Отменить',
        fn: () => {
          setConstraint(null);
          setState((cur) => sanitizeState({ ...cur, ...prevSnapshot }));
        },
      });
    },
    [pushToast]
  );

  const handleReset = useCallback(() => {
    const next = sanitizeState({
      ...DEFAULTS,
      view: stateRef.current.view,
      sceneBg: stateRef.current.sceneBg,
    });
    setState(next);
    setHolesCustomized(false);
    setUi((prev) => ({ ...prev, customRange: false }));
    setConstraint(null);
    setActivePresetKey('builtin:0');
    pushToast('Сброшено к стандарту 16,5 см · Дверь M5 / Динамик Ø4,2', 'ok');
  }, [pushToast]);

  const focusSectionTarget = useCallback((target: ConstraintJumpTarget) => {
    setConstraint(null);
    setUi((prev) =>
      prev.mode === 'wizard'
        ? {
            ...prev,
            wizardStep: target === 'ring' ? 0 : wizardStepForLayer(target),
          }
        : {
            ...prev,
            open: { ...prev.open, [target]: true },
          }
    );
    window.requestAnimationFrame(() => {
      document.getElementById(`card-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  useEffect(() => {
    if (initial.restored) {
      const id = window.setTimeout(() => {
        pushToast('Параметры восстановлены из прошлой сессии', 'info', {
          label: 'Сбросить',
          fn: () => handleReset(),
        });
      }, 600);
      return () => clearTimeout(id);
    }
  }, [handleReset, initial.restored, pushToast]);

  const handleExportDXF = useCallback(() => {
    const content = buildDXF(stateRef.current, analysis);
    downloadBlob(new Blob([content], { type: 'application/dxf' }), `${buildFileBase(stateRef.current)}.dxf`);
    const extraRecess = [
      analysis.holes.some((h) => h.valid && h.cbDepth > 0 && h.recessType === 'cb') ? 'цековка' : null,
      analysis.holes.some((h) => h.valid && h.cbDepth > 0 && h.recessType === 'csk') ? 'зенковка' : null,
    ].filter(Boolean);
    pushToast(
      analysis.nWarn || analysis.nErr
        ? 'DXF сохранён — обратите внимание на замечания геометрии'
        : `DXF сохранён · контуры и отверстия${extraRecess.length ? ` (${extraRecess.join(', ')})` : ''}`,
      'ok'
    );
  }, [analysis, pushToast]);

  const handleExportSVG = useCallback(() => {
    const src = vp2dRef.current?.exportSvgString();
    if (!src) return;
    downloadBlob(new Blob([src], { type: 'image/svg+xml' }), `${buildFileBase(stateRef.current)}.svg`);
    pushToast('SVG-чертёж 1:1 сохранён', 'ok');
  }, [pushToast]);

  const handleExportSTL = useCallback(async () => {
    if (!vp3dRef.current || analysis.nErr > 0) return;
    try {
      const dv = await vp3dRef.current.exportSTL();
      downloadBlob(
        new Blob([dv.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
        `${buildFileBase(stateRef.current)}.stl`
      );
      pushToast('STL сохранён · цековки и зенковки обоих слоёв · мм', 'ok');
    } catch {
      pushToast('Не удалось построить STL-модель', 'err');
    }
  }, [analysis.nErr, pushToast]);

  const handleExportPNG = useCallback(() => {
    if (stateRef.current.view === '2d') {
      const svgStr = vp2dRef.current?.exportSvgString();
      if (!svgStr) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1400;
        canvas.height = 1400;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#fcfdfe';
        ctx.fillRect(0, 0, 1400, 1400);
        ctx.drawImage(img, 0, 0, 1400, 1400);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${buildFileBase(stateRef.current)}_2d.png`;
        a.click();
        pushToast('PNG-снимок 2D-чертежа сохранён', 'ok');
      };
      img.onerror = () => {
        pushToast('Не удалось сохранить PNG-снимок чертежа', 'err');
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
      return;
    }

    if (!vp3dRef.current) return;
    try {
      const url = vp3dRef.current.png();
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${buildFileBase(stateRef.current)}.png`;
      a.click();
      pushToast('PNG-снимок 3D-сцены сохранён', 'ok');
    } catch {
      pushToast('Не удалось сохранить PNG-снимок', 'err');
    }
  }, [pushToast]);

  const onViewport3DReady = useCallback(
    (ok: boolean) => {
      setReady3d(ok);
      if (!ok && stateRef.current.view === '3d') {
        setState((prev) => ({ ...prev, view: '2d' }));
        pushToast('3D недоступно — открыт 2D-чертёж. DXF и SVG работают полностью.', 'warn');
      }
    },
    [pushToast]
  );

  const hasIssue = analysis.nErr > 0 || analysis.nWarn > 0;
  const issueIsErr = analysis.nErr > 0;
  const isDark3d = state.view === '3d' && state.sceneBg === 'dark';

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <HeaderBar
        hasErrors={analysis.nErr > 0}
        wizardActive={ui.mode === 'wizard'}
        onOpenPresets={() => {
          clearToasts();
          setPresetsOpen(true);
        }}
        onOpenExport={() => {
          clearToasts();
          setExportOpen(true);
        }}
      />

      <main className="mx-auto flex w-full max-w-[1720px] flex-1 flex-col gap-2.5 p-2.5 lg:min-h-0 lg:flex-row lg:overflow-hidden lg:gap-3 lg:px-6 lg:py-3">
        {/* Left/Main Stage */}
        <section className="flex min-w-0 flex-col lg:flex-1 lg:min-h-0">
          {/* Viewport Card */}
          <div
            className={`flex shrink-0 flex-col overflow-hidden rounded-xl border shadow-xs transition-colors lg:h-auto lg:flex-1 lg:min-h-0 ${
              isDark3d ? 'border-slate-700 bg-[#252b33]' : 'border-[#cfd8e3] bg-[#dbe2ea]'
            } ${drawerTab ? 'h-[520px] sm:h-[560px]' : 'h-[360px] sm:h-[420px]'}`}
          >
            <div className="relative flex-1 min-h-0 overflow-hidden">
              <ErrorBoundary fallback={() => <Viewport3DCrashed onFailed={onViewport3DReady} />}>
                <Viewport3D
                  ref={vp3dRef}
                  state={state}
                  analysis={analysis}
                  visible={state.view === '3d'}
                  onReady={onViewport3DReady}
                  onSwitchTo2D={() => setState((prev) => ({ ...prev, view: '2d' }))}
                  onCameraSync={(m) => viewCubeRef.current?.syncFromCamera(m)}
                />
              </ErrorBoundary>
              <Viewport2D ref={vp2dRef} state={state} analysis={analysis} visible={state.view === '2d'} />

              {/* Top Viewport Toolbar: left = mode + inspection, center = warning/spec, right = 2D zoom (3D reserves top-right exclusively for ViewCube) */}
              <div
                className={`pointer-events-none relative z-10 flex items-center justify-between gap-2 p-2.5 sm:p-3 ${
                  state.view === '3d' ? 'sm:pr-[124px]' : ''
                }`}
              >
                <div className="pointer-events-auto flex shrink-0 items-center gap-2">
                  <div
                    className={`inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg border p-0.5 shadow-xs transition-colors ${
                      isDark3d ? 'border-slate-600/80 bg-[#1a2028]/95' : 'border-[#cfd8e3] bg-white/95'
                    }`}
                    role="tablist"
                    aria-label="Режим просмотра"
                  >
                    <button
                      id="tab-3d"
                      type="button"
                      role="tab"
                      aria-selected={state.view === '3d'}
                      onClick={() => setState((prev) => ({ ...prev, view: '3d' }))}
                      className={`inline-flex h-full items-center rounded-md px-2.5 sm:px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                        state.view === '3d'
                          ? isDark3d
                            ? 'bg-[#1e3a5f] text-blue-100'
                            : 'bg-[#eaf1fb] text-[#154b96]'
                          : isDark3d
                            ? 'text-slate-300 hover:text-white'
                            : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      3D-модель
                    </button>
                    <button
                      id="tab-2d"
                      type="button"
                      role="tab"
                      aria-selected={state.view === '2d'}
                      onClick={() => setState((prev) => ({ ...prev, view: '2d' }))}
                      className={`inline-flex h-full items-center rounded-md px-2.5 sm:px-3 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                        state.view === '2d'
                          ? 'bg-[#eaf1fb] text-[#154b96]'
                          : isDark3d
                            ? 'text-slate-300 hover:text-white'
                            : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Чертёж 1:1
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-expanded={drawerTab !== null}
                    aria-controls="inspection-drawer"
                    title="Проверки и таблица отверстий"
                    onClick={() => openDrawer(drawerTab ? null : hasIssue ? 'checks' : 'table')}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 sm:px-3 text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                      drawerTab !== null
                        ? isDark3d
                          ? 'border-blue-400 bg-[#1e3a5f] text-blue-100'
                          : 'border-[#1e63c4] bg-[#eaf1fb] text-[#154b96]'
                        : issueIsErr
                          ? isDark3d
                            ? 'border-red-400/70 bg-red-950/90 text-red-200 hover:bg-red-900/90'
                            : 'border-red-300 bg-red-50/95 text-red-700 hover:bg-red-100'
                          : analysis.nWarn > 0
                            ? isDark3d
                              ? 'border-amber-400/70 bg-amber-950/90 text-amber-200 hover:bg-amber-900/90'
                              : 'border-amber-300 bg-amber-50/95 text-amber-900 hover:bg-amber-100'
                            : isDark3d
                              ? 'border-slate-600/80 bg-[#1a2028]/95 text-slate-200 hover:border-blue-400 hover:text-white'
                              : 'border-[#cfd8e3] bg-white/95 text-slate-700 hover:border-[#1e63c4] hover:text-[#154b96]'
                    }`}
                  >
                    {issueIsErr ? (
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : analysis.nWarn > 0 ? (
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="hidden min-[360px]:inline">
                      {issueIsErr
                        ? `Ошибки: ${analysis.nErr}`
                        : analysis.nWarn > 0
                          ? `Замечания: ${analysis.nWarn}`
                          : 'Контроль'}
                    </span>
                    <span className="font-mono-num font-bold opacity-85">
                      {issueIsErr || analysis.nWarn > 0 ? (
                        <span className="min-[360px]:hidden">{analysis.nErr || analysis.nWarn}</span>
                      ) : (
                        analysis.holes.length
                      )}
                    </span>
                  </button>
                </div>

                {/* Center slot: inline error/warning banner on md+ when issues exist, otherwise spec readout on xl+ */}
                <div className="flex min-w-0 flex-1 justify-center">
                  {hasIssue && !drawerTab ? (
                    <button
                      type="button"
                      onClick={() => openDrawer('checks')}
                      className={`pointer-events-auto hidden md:inline-flex h-9 max-w-full items-center gap-2 rounded-lg border px-3 text-left text-xs shadow-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/45 ${
                        issueIsErr
                          ? isDark3d
                            ? 'border-red-400/70 bg-red-950/95 text-red-100 hover:bg-red-900/95'
                            : 'border-red-300 bg-red-50/95 text-red-900 hover:bg-red-100/95'
                          : isDark3d
                            ? 'border-amber-400/70 bg-amber-950/95 text-amber-100 hover:bg-amber-900/95'
                            : 'border-amber-300 bg-amber-50/95 text-amber-950 hover:bg-amber-100/95'
                      }`}
                    >
                      {issueIsErr ? (
                        <AlertCircle
                          className={`h-4 w-4 shrink-0 ${isDark3d ? 'text-red-400' : 'text-red-600'}`}
                          aria-hidden="true"
                        />
                      ) : (
                        <AlertTriangle
                          className={`h-4 w-4 shrink-0 ${isDark3d ? 'text-amber-400' : 'text-amber-600'}`}
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate font-medium">{analysis.checks[0]?.short ?? analysis.checks[0]?.t}</span>
                      <span className="shrink-0 font-semibold underline underline-offset-2 whitespace-nowrap">
                        Подробнее
                      </span>
                    </button>
                  ) : (
                    <div
                      className={`hidden xl:inline-flex h-9 min-w-0 items-center gap-1.5 truncate rounded-lg border px-3 font-mono-num text-[11.5px] font-medium shadow-xs transition-colors ${
                        isDark3d
                          ? 'border-slate-600/80 bg-[#1a2028]/95 text-slate-100'
                          : 'border-[#cfd8e3] bg-white/95 text-slate-800'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <DiameterIcon className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {fmtN(state.outerD, 0)}/{fmtN(state.innerD, 0)} × {fmtN(state.thick, 0)} мм
                        </span>
                      </span>
                      {(state.doorBolt !== 'custom' ||
                        state.spkBolt !== 'custom' ||
                        analysis.fd.active ||
                        analysis.fs.active) && (
                        <>
                          <span aria-hidden="true" className={isDark3d ? 'text-slate-400' : 'text-slate-500'}>
                            ·
                          </span>
                          <span
                            className={`inline-flex items-center gap-2 ${isDark3d ? 'text-slate-300' : 'text-slate-600'}`}
                          >
                            {(state.doorBolt !== 'custom' || analysis.fd.active) && (
                              <span className="inline-flex items-center gap-1">
                                <span>
                                  Дверь: {state.doorBolt !== 'custom' ? state.doorBolt : `Ø${fmtN(state.doorHoleD)}`}
                                </span>
                                {analysis.fd.active &&
                                  (analysis.fd.recessType === 'csk' ? (
                                    <CountersinkIcon className="h-3.5 w-3.5 shrink-0" />
                                  ) : (
                                    <CounterboreIcon className="h-3.5 w-3.5 shrink-0" />
                                  ))}
                              </span>
                            )}
                            {(state.spkBolt !== 'custom' || analysis.fs.active) && (
                              <span className="inline-flex items-center gap-1">
                                <span>
                                  Динамик: {state.spkBolt !== 'custom' ? state.spkBolt : `Ø${fmtN(state.spkHoleD)}`}
                                </span>
                                {analysis.fs.active &&
                                  (analysis.fs.recessType === 'csk' ? (
                                    <CountersinkIcon className="h-3.5 w-3.5 shrink-0" />
                                  ) : (
                                    <CounterboreIcon className="h-3.5 w-3.5 shrink-0" />
                                  ))}
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Viewport Tools (2D zoom group; 3D corner is exclusively ViewCube) */}
                {state.view === '2d' && (
                  <div className="pointer-events-auto inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg border border-[#cfd8e3] bg-white/95 p-0.5 shadow-xs">
                    <button
                      type="button"
                      onClick={() => vp2dRef.current?.zoomOut()}
                      aria-label="Отдалить чертёж"
                      title="Отдалить"
                      className="inline-flex h-7.5 w-7.5 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                    >
                      <ZoomOut className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => vp2dRef.current?.zoomIn()}
                      aria-label="Приблизить чертёж"
                      title="Приблизить"
                      className="inline-flex h-7.5 w-7.5 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                    >
                      <ZoomIn className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => vp2dRef.current?.fit()}
                      aria-label="Вписать чертёж"
                      title="Вписать чертёж"
                      className="inline-flex h-7.5 w-7.5 items-center justify-center rounded-md text-slate-600 hover:bg-blue-50 hover:text-[#1e63c4] cursor-pointer"
                    >
                      <Maximize2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              {/* Autodesk-style 3D ViewCube (dedicated uncluttered top-right corner on sm+, cleanly below Row 1 on narrow mobile) */}
              {state.view === '3d' && (
                <div className="pointer-events-none absolute right-2.5 top-[56px] sm:right-3 sm:top-3 z-10 origin-top-right scale-[0.76] sm:scale-100">
                  <ViewCube
                    ref={viewCubeRef}
                    sceneBg={state.sceneBg}
                    onSelectDirection={(dx, dy, dz) => vp3dRef.current?.setViewDirection(dx, dy, dz)}
                    onOrbitBy={(dAz, dPol) => vp3dRef.current?.orbitBy(dAz, dPol)}
                    onResetHome={() => vp3dRef.current?.resetCam()}
                  />
                </div>
              )}

              {/* Compact mobile-only warning/error banner below Row 1 with clean air before ViewCube */}
              {hasIssue && !drawerTab && (
                <div
                  className={`pointer-events-none relative z-10 flex md:hidden px-2.5 ${
                    state.view === '3d' ? 'justify-start pr-[98px]' : 'justify-center'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openDrawer('checks')}
                    className={`pointer-events-auto flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] shadow-xs transition-colors cursor-pointer ${
                      issueIsErr
                        ? isDark3d
                          ? 'border-red-400/70 bg-red-950/95 text-red-100'
                          : 'border-red-300 bg-red-50/95 text-red-900'
                        : isDark3d
                          ? 'border-amber-400/70 bg-amber-950/95 text-amber-100'
                          : 'border-amber-300 bg-amber-50/95 text-amber-950'
                    }`}
                  >
                    {issueIsErr ? (
                      <AlertCircle
                        className={`h-4 w-4 shrink-0 ${isDark3d ? 'text-red-400' : 'text-red-600'}`}
                        aria-hidden="true"
                      />
                    ) : (
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 ${isDark3d ? 'text-amber-400' : 'text-amber-600'}`}
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate font-medium">{analysis.checks[0]?.short ?? analysis.checks[0]?.t}</span>
                    <span className="shrink-0 font-semibold underline underline-offset-2 whitespace-nowrap">
                      Подробнее
                    </span>
                  </button>
                </div>
              )}

              {/* Bottom Viewport Legend (2D paired layout) & Centered 3D Hint */}
              <div
                className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 p-2.5 sm:p-3 ${
                  state.view === '2d' ? 'justify-between' : 'justify-center'
                }`}
              >
                {state.view === '2d' && (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-[#cfd8e3] bg-white/95 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-xs">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-0.5 w-3 rounded bg-[#16202b]" />
                      Контур
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-0.5 w-3 rounded bg-[#1e63c4]" />К двери
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-0.5 w-3 rounded bg-[#d9541e]" />К динамику
                    </span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="w-3 border-t-2 border-dashed border-slate-500" />
                      <CounterboreIcon className="h-3.5 w-3.5 text-slate-600" />
                      <span>Цековка</span>
                    </span>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="w-3 border-t-2 border-slate-500" />
                      <CountersinkIcon className="h-3.5 w-3.5 text-slate-600" />
                      <span>Зенковка</span>
                    </span>
                  </div>
                )}

                <div
                  className={`hidden md:block rounded-lg border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    isDark3d
                      ? 'border-slate-600/80 bg-[#1a2028]/95 text-slate-200'
                      : 'border-[#cfd8e3] bg-white/95 text-slate-600'
                  }`}
                >
                  {state.view === '3d'
                    ? 'ЛКМ — вращение · колесо — масштаб · ПКМ — панорама'
                    : 'Перетаскивание — панорама · колесо — масштаб · 2×клик — вписать'}
                </div>
              </div>
            </div>

            <InspectionDrawer
              tab={drawerTab}
              analysis={analysis}
              onChangeTab={(tab) => setDrawerTab(tab)}
              onFocusLayer={(layer) => focusSectionTarget(layer)}
            />
          </div>
        </section>

        {/* Right Control Panel */}
        <ControlPanel
          state={state}
          analysis={analysis}
          ui={ui}
          ready3d={ready3d}
          constraint={constraint}
          autoFitHolesActive={autoFitHolesActive}
          onPatch={handlePatch}
          onSelectQuickSize={handleSelectQuickSize}
          onToggleCustomRange={handleToggleCustomRange}
          onAutoFitHoles={handleAutoFitHoles}
          onDismissConstraint={() => setConstraint(null)}
          onFocusTarget={focusSectionTarget}
          onToggleAccordion={(id) => {
            setUi((prev) => ({ ...prev, open: { ...prev.open, [id]: !prev.open[id] } }));
          }}
          onToggleAll={(open) => {
            setUi((prev) => ({
              ...prev,
              open: {
                ring: open,
                door: open,
                spk: open,
                scene: open,
              },
            }));
          }}
          onCopyLayer={handleCopyLayer}
          onReset={handleReset}
          onWizardStepChange={(step) => {
            setConstraint(null);
            setUi((prev) => ({ ...prev, wizardStep: clampWizardStep(step) }));
          }}
          onFinishWizard={() => {
            setConstraint(null);
            setUi((prev) => ({
              ...prev,
              mode: 'edit',
              open: { ring: false, door: false, spk: false, scene: false },
            }));
            pushToast('Модель собрана — каждый раздел доступен для отдельного редактирования', 'ok');
          }}
          onSkipWizard={() => {
            setConstraint(null);
            setUi((prev) => ({
              ...prev,
              mode: 'edit',
              open: { ring: false, door: false, spk: false, scene: false },
            }));
          }}
          onStartWizard={() => {
            setConstraint(null);
            setUi((prev) => ({ ...prev, mode: 'wizard', wizardStep: 0 }));
          }}
          onOpenPresets={() => {
            clearToasts();
            setPresetsOpen(true);
          }}
          onOpenExport={() => {
            clearToasts();
            setExportOpen(true);
          }}
          onExportSTL={handleExportSTL}
          onExportDXF={handleExportDXF}
          onExportSVG={handleExportSVG}
          onOpenChecks={() => openDrawer('checks')}
        />
      </main>

      <PresetsModal
        open={presetsOpen}
        activeKey={activePresetKey}
        savedPresets={savedPresets}
        currentOuterD={state.outerD}
        currentThick={state.thick}
        onClose={() => setPresetsOpen(false)}
        onSelectPreset={handleSelectPreset}
        onSelectSaved={handleSelectSaved}
        onSaveCurrent={handleSaveCurrent}
        onDeleteSaved={handleDeleteSaved}
      />

      <ExportModal
        open={exportOpen}
        state={state}
        analysis={analysis}
        ready3d={ready3d}
        onClose={() => setExportOpen(false)}
        onShowChecks={() => openDrawer('checks')}
        onExportDXF={handleExportDXF}
        onExportSTL={handleExportSTL}
        onExportSVG={handleExportSVG}
        onExportPNG={handleExportPNG}
      />

      <ToastHost toasts={toasts} drawerOpen={drawerTab !== null} onDismiss={dismissToast} />
    </div>
  );
}
