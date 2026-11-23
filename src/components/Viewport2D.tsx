import { locale, t } from '../i18n';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { clamp, D2R, f2, fmtN, TAU } from '../core/geometry';
import { applyExportFrame, DRAWING_MARGIN_MM, exportFrame } from '../core/svgExport';
import type { AnalysisResult, FastenerSummary, HoleInfo, Point2D, SpacerState } from '../core/types';
import { CounterboreIcon, CountersinkIcon, DiameterIcon } from './CadIcons';

export interface Viewport2DHandle {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  exportSvgString: () => string;
}

interface Viewport2DProps {
  state: SpacerState;
  analysis: AnalysisResult;
  visible: boolean;
}

interface ViewBoxState {
  x: number;
  y: number;
  w: number;
  h: number;
}

const C_INK = '#16202b';
const C_BLUE = '#1e63c4';
const C_ORANGE = '#d9541e';
const C_ERR = '#c23434';
const C_CUT = '#475569';
const C_DIM = '#33475c';
const C_GRID = '#64748b';
const C_SHEET = '#fcfdfe';

const pathFrom = (pts: Point2D[]): string =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${f2(p[0])},${f2(-p[1])}`).join('') + 'Z';

const circleSub = (cx: number, cy: number, r: number): string =>
  `M${f2(cx + r)},${f2(-cy)}A${f2(r)},${f2(r)} 0 1 0 ${f2(cx - r)},${f2(-cy)}A${f2(r)},${f2(r)} 0 1 0 ${f2(cx + r)},${f2(-cy)}Z`;

const holePath = (h: HoleInfo): string => (h.type === 'circle' ? circleSub(h.cx, h.cy, h.r) : pathFrom(h.pts));

export const Viewport2D = forwardRef<Viewport2DHandle, Viewport2DProps>(function Viewport2D(
  { state, analysis, visible },
  ref
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [vb, setVb] = useState<ViewBoxState | null>(null);
  const [userZoomed, setUserZoomed] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const lastClientRef = useRef<[number, number] | null>(null);

  const hasInitFitRef = useRef(false);

  const computeFit = useCallback(() => {
    const E = analysis.maxR + DRAWING_MARGIN_MM;
    const pxH = Math.max(wrapRef.current?.clientHeight || 420, 120);
    const topPx = pxH < 240 ? 34 : 50;
    const botPx = pxH < 240 ? 36 : 48;
    const k = clamp((topPx + botPx) / pxH, 0, 0.54);
    const size = (2 * E) / (1 - k);
    const topMm = topPx * (size / pxH);
    setVb({ x: -size / 2, y: -E - topMm, w: size, h: size });
    setUserZoomed(false);
  }, [analysis.maxR]);

  useEffect(() => {
    if (!hasInitFitRef.current || (!userZoomed && visible)) {
      hasInitFitRef.current = true;
      computeFit();
    }
  }, [computeFit, userZoomed, visible]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (visible && !userZoomed) computeFit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [computeFit, userZoomed, visible]);

  const svgPt = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: -p.y };
  }, []);

  const zoomAt = useCallback(
    (cx: number, cy: number, f: number) => {
      const p = svgPt(cx, cy);
      if (!p) return;
      setVb((prev) => {
        if (!prev) return prev;
        const nw = clamp(prev.w * f, 36, 1600);
        const k = nw / prev.w;
        return {
          x: p.x - (p.x - prev.x) * k,
          y: -p.y - (-p.y - prev.y) * k,
          w: nw,
          h: nw,
        };
      });
      setUserZoomed(true);
    },
    [svgPt]
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.pow(1.14, e.deltaY > 0 ? 1 : -1));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  useImperativeHandle(
    ref,
    () => ({
      fit: () => computeFit(),
      zoomIn: () => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.3);
      },
      zoomOut: () => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.3);
      },
      exportSvgString: () => {
        const svg = svgRef.current;
        if (!svg) return '';
        const clone = svg.cloneNode(true) as SVGSVGElement;
        const hov = clone.querySelector('#hovG');
        if (hov) hov.innerHTML = '';
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        applyExportFrame(clone, exportFrame(analysis.maxR));
        clone.removeAttribute('class');
        clone.removeAttribute('role');
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
      },
    }),
    [computeFit, zoomAt, analysis.maxR]
  );

  const svgMarkup = useMemo(() => {
    const s = state;
    const a = analysis;
    const E = a.maxR + 40;
    const oPath = pathFrom(a.oPts);
    let fillD = oPath;
    if (a.cutValid) fillD += circleSub(0, 0, a.ir);
    a.holes.forEach((h) => {
      if (h.valid) fillD += holePath(h);
    });

    const txt = (x: number, y: number, str: string, col: string, size: number, anchor = 'middle', weight = 600) =>
      `<text x="${f2(x)}" y="${f2(y)}" fill="${col}" font-family="IBM Plex Mono, monospace" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" paint-order="stroke" stroke="${C_SHEET}" stroke-width="1.7" stroke-linejoin="round">${str}</text>`;

    const fastLabel = (fa: FastenerSummary, n: number, holeD: number, slots: boolean) => {
      const head = slots ? t('пазы ') : '';
      const rec = !fa.active
        ? ''
        : fa.recessType === 'csk'
          ? ` ⌵${fmtN(fa.cbD)}×90°`
          : ` ⌴${fmtN(fa.cbD)}×${fmtN(fa.actualCbDepth, 1)}`;
      if (fa.bolt !== 'custom') {
        return `${head}${n}×${fa.bolt}${rec}`;
      }
      return `${head}${n}×Ø${fmtN(holeD)}${rec}`;
    };

    let g = `<defs>
      <pattern id="g5" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#e8edf3" stroke-width=".22"/></pattern>
      <pattern id="g25" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#d5dee8" stroke-width=".36"/></pattern>
      <marker id="mD" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto-start-reverse"><path d="M0 0 7 3 0 6Z" fill="${C_DIM}"/></marker>
    </defs>`;

    g += `<rect x="-2000" y="-2000" width="4000" height="4000" fill="${C_SHEET}"/>
      <rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#g5)"/>
      <rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#g25)"/>`;

    g += `<path d="${fillD}" fill="rgba(22,32,43,0.055)" fill-rule="evenodd"/>`;
    g += `<circle cx="0" cy="0" r="${f2(s.doorBCD / 2)}" fill="none" stroke="${C_BLUE}" stroke-opacity=".55" stroke-width=".6" stroke-dasharray="4 2.4" vector-effect="non-scaling-stroke"/>`;
    g += `<circle cx="0" cy="0" r="${f2(s.spkBCD / 2)}" fill="none" stroke="${C_ORANGE}" stroke-opacity=".55" stroke-width=".6" stroke-dasharray="4 2.4" vector-effect="non-scaling-stroke"/>`;
    g += `<path d="${oPath}" fill="none" stroke="${C_INK}" stroke-width="1.65" vector-effect="non-scaling-stroke"/>`;
    g += a.cutValid
      ? `<circle cx="0" cy="0" r="${f2(a.ir)}" fill="none" stroke="${C_CUT}" stroke-width="1.15" vector-effect="non-scaling-stroke"/>`
      : `<circle cx="0" cy="0" r="${f2(a.ir)}" fill="none" stroke="${C_ERR}" stroke-width="1.2" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>`;

    a.holes.forEach((h) => {
      const col = h.valid ? (h.kind === 'door' ? C_BLUE : C_ORANGE) : C_ERR;
      const fill = h.valid
        ? h.kind === 'door'
          ? 'rgba(30,99,196,.11)'
          : 'rgba(217,84,30,.11)'
        : 'rgba(194,52,52,.13)';
      const dash = h.valid ? '' : 'stroke-dasharray="2.4 1.6"';
      if (h.cbDepth > 0) {
        const cbCol = h.valid ? col : C_ERR;
        const isCsk = h.recessType === 'csk';
        const recDash = isCsk ? '' : 'stroke-dasharray="3 1.6"';
        const recFill = h.valid ? (isCsk ? 'rgba(22,32,43,.06)' : 'rgba(22,32,43,.04)') : 'none';
        if (h.type === 'circle') {
          g += `<circle cx="${f2(h.cx)}" cy="${f2(-h.cy)}" r="${f2(h.cbR)}" fill="${recFill}" stroke="${cbCol}" stroke-opacity="${isCsk ? '.85' : '.75'}" stroke-width=".9" ${recDash} vector-effect="non-scaling-stroke"/>`;
        } else if (h.cbPts) {
          g += `<path d="${pathFrom(h.cbPts)}" fill="${recFill}" stroke="${cbCol}" stroke-opacity="${isCsk ? '.85' : '.75'}" stroke-width=".9" ${recDash} vector-effect="non-scaling-stroke"/>`;
        }
      }
      if (h.type === 'circle') {
        g += `<circle cx="${f2(h.cx)}" cy="${f2(-h.cy)}" r="${f2(h.r)}" fill="${fill}" stroke="${col}" stroke-width="1.25" ${dash} vector-effect="non-scaling-stroke"/>`;
      } else {
        g += `<path d="${pathFrom(h.pts)}" fill="${fill}" stroke="${col}" stroke-width="1.25" ${dash} vector-effect="non-scaling-stroke"/>`;
      }
      g += `<path d="M${f2(h.cx - 2.2)},${f2(-h.cy)}H${f2(h.cx + 2.2)}M${f2(h.cx)},${f2(-h.cy - 2.2)}V${f2(-h.cy + 2.2)}" stroke="${col}" stroke-width=".55" stroke-opacity=".9" vector-effect="non-scaling-stroke"/>`;
    });

    g += `<path d="M-7 0H7M0 -7V7" stroke="${C_GRID}" stroke-width=".55" vector-effect="non-scaling-stroke"/><circle cx="0" cy="0" r="1.6" fill="none" stroke="${C_GRID}" stroke-width=".55" vector-effect="non-scaling-stroke"/>`;

    if (s.showDims) {
      const dy = a.maxR + 13;
      g += `<path d="M${f2(-a.R)} 2V${f2(dy + 3)}M${f2(a.R)} 2V${f2(dy + 3)}" stroke="${C_DIM}" stroke-opacity=".45" stroke-width=".45" vector-effect="non-scaling-stroke"/>`;
      g += `<line x1="${f2(-a.R)}" y1="${f2(dy)}" x2="${f2(a.R)}" y2="${f2(dy)}" stroke="${C_DIM}" stroke-width=".7" marker-start="url(#mD)" marker-end="url(#mD)" vector-effect="non-scaling-stroke"/>`;
      g += txt(0, dy - 3, `Ø ${fmtN(s.outerD, 0)}`, C_DIM, 6.2);
      if (a.cutValid && a.ir > 12) {
        g += `<line x1="${f2(-a.ir)}" y1="0" x2="${f2(a.ir)}" y2="0" stroke="${C_DIM}" stroke-width=".55" marker-start="url(#mD)" marker-end="url(#mD)" vector-effect="non-scaling-stroke"/>`;
        g += txt(0, -4, `Ø ${fmtN(s.innerD, 0)}`, C_DIM, 5.2);
      }
      const holeAngles = a.holes.map((h) => {
        if (h.type === 'circle') return Math.atan2(h.cy, h.cx);
        return h.ang;
      });
      const angDist = (a1: number, a2: number) => {
        const d = Math.abs((((a1 - a2) % TAU) + TAU) % TAU);
        return d > Math.PI ? TAU - d : d;
      };
      const pickClearAngle = (candidatesDeg: number[]) => {
        let best = candidatesDeg[0] * D2R;
        let bestScore = -1;
        for (const deg of candidatesDeg) {
          const rad = deg * D2R;
          const minSep = holeAngles.length ? Math.min(...holeAngles.map((ha) => angDist(rad, ha))) : Math.PI;
          if (minSep > bestScore) {
            bestScore = minSep;
            best = rad;
          }
        }
        return best;
      };

      const txtHalo = (x: number, y: number, str: string, col: string, size: number, anchor = 'middle', weight = 600) =>
        `<text x="${f2(x)}" y="${f2(y)}" fill="${col}" font-family="IBM Plex Mono, monospace" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" paint-order="stroke" stroke="${C_SHEET}" stroke-width="2.9" stroke-linejoin="round">${str}</text>`;

      const calloutR = a.maxR + 12;

      const la = pickClearAngle([34, 326, 48, 312]);
      const ld = s.doorBCD / 2;
      const lx = calloutR * Math.cos(la);
      const ly = -calloutR * Math.sin(la);
      const lElbow = lx + 6;
      g += `<polyline points="${f2(ld * Math.cos(la))},${f2(-ld * Math.sin(la))} ${f2(lx)},${f2(ly)} ${f2(lElbow)},${f2(ly)}" fill="none" stroke="${C_BLUE}" stroke-opacity=".75" stroke-width=".6" vector-effect="non-scaling-stroke"/>`;
      g += `<circle cx="${f2(ld * Math.cos(la))}" cy="${f2(-ld * Math.sin(la))}" r="1.2" fill="${C_BLUE}"/>`;
      g += txtHalo(
        lElbow + 2,
        ly + 1.6,
        t('Дверь Ø{0} · {1}', fmtN(s.doorBCD, 0), fastLabel(a.fd, s.doorN, s.doorHoleD, s.doorSlots)),
        C_BLUE,
        4.8,
        'start'
      );

      const sa = pickClearAngle([152, 208, 138, 222]);
      const sd = s.spkBCD / 2;
      const sx = calloutR * Math.cos(sa);
      const sy = -calloutR * Math.sin(sa);
      const sElbow = sx - 6;
      g += `<polyline points="${f2(sd * Math.cos(sa))},${f2(-sd * Math.sin(sa))} ${f2(sx)},${f2(sy)} ${f2(sElbow)},${f2(sy)}" fill="none" stroke="${C_ORANGE}" stroke-opacity=".75" stroke-width=".6" vector-effect="non-scaling-stroke"/>`;
      g += `<circle cx="${f2(sd * Math.cos(sa))}" cy="${f2(-sd * Math.sin(sa))}" r="1.2" fill="${C_ORANGE}"/>`;
      g += txtHalo(
        sElbow - 2,
        sy + 1.6,
        t('Динамик Ø{0} · {1}', fmtN(s.spkBCD, 0), fastLabel(a.fs, s.spkN, s.spkHoleD, s.spkSlots)),
        C_ORANGE,
        4.8,
        'end'
      );
    }

    const bx = E - 76;
    const by = E - 22;
    const dt = new Date().toLocaleDateString(locale);
    g += `<g>
      <rect x="${f2(bx)}" y="${f2(by)}" width="84" height="24" rx="1.5" fill="#ffffff" stroke="${C_DIM}" stroke-width=".6"/>
      <line x1="${f2(bx)}" y1="${f2(by + 10.5)}" x2="${f2(bx + 84)}" y2="${f2(by + 10.5)}" stroke="${C_DIM}" stroke-width=".35" stroke-opacity=".5"/>
      ${txt(bx + 4.5, by + 7.5, t('ПРОСТАВКА Ø{0} × {1}', fmtN(s.outerD, 0), fmtN(s.thick, 0)), C_INK, 4.8, 'start', 700)}
      ${txt(bx + 4.5, by + 16, t('RingCraft · масштаб 1:1 · мм'), C_GRID, 3.4, 'start')}
      ${txt(bx + 4.5, by + 21.3, t('Вырез Ø{0} мм · {1} · 2 слоя', fmtN(s.innerD, 0), dt), C_GRID, 3.4, 'start')}
    </g>`;

    return g;
  }, [state, analysis]);

  const hoverMarkup = useMemo(() => {
    if (hoverIdx < 0 || hoverIdx >= analysis.holes.length) return '';
    const h = analysis.holes[hoverIdx];
    return h.type === 'circle'
      ? `<circle cx="${f2(h.cx)}" cy="${f2(-h.cy)}" r="${f2(h.effR + 1.3)}" fill="none" stroke="#16202b" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`
      : `<path d="${pathFrom(h.cbPts || h.pts)}" fill="none" stroke="#16202b" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  }, [analysis.holes, hoverIdx]);

  const hoveredHole = hoverIdx >= 0 && hoverIdx < analysis.holes.length ? analysis.holes[hoverIdx] : null;

  return (
    <div
      ref={wrapRef}
      className={`absolute inset-0 bg-[#fcfdfe] ${visible ? 'block' : 'hidden'}`}
      role="tabpanel"
      aria-labelledby="tab-2d"
    >
      <svg
        ref={svgRef}
        data-testid="viewport-2d-svg"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        viewBox={vb ? `${f2(vb.x)} ${f2(vb.y)} ${f2(vb.w)} ${f2(vb.h)}` : '-130 -130 260 260'}
        role="img"
        aria-label={t('Чертёж проставки, вид сверху')}
        className={`block h-full w-full select-none touch-none ${panning ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          setPanning(true);
          lastClientRef.current = [e.clientX, e.clientY];
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }}
        onPointerMove={(e) => {
          if (panning && lastClientRef.current) {
            const p1 = svgPt(lastClientRef.current[0], lastClientRef.current[1]);
            const p2 = svgPt(e.clientX, e.clientY);
            if (p1 && p2) {
              setVb((prev) =>
                prev
                  ? {
                      ...prev,
                      x: clamp(prev.x - (p2.x - p1.x), -900, 900),
                      y: clamp(prev.y + (p2.y - p1.y), -900, 900),
                    }
                  : prev
              );
              setUserZoomed(true);
            }
            lastClientRef.current = [e.clientX, e.clientY];
            setTipPos(null);
            return;
          }

          const p = svgPt(e.clientX, e.clientY);
          if (!p) return;
          let found = -1;
          for (let i = 0; i < analysis.holes.length; i++) {
            const h = analysis.holes[i];
            if (h.type === 'circle') {
              if (Math.hypot(p.x - h.cx, p.y - h.cy) <= h.effR + 1.8) {
                found = i;
                break;
              }
            } else {
              const d = Math.hypot(p.x, p.y);
              const ang = Math.atan2(p.y, p.x);
              let da = Math.abs((((ang - h.ang) % TAU) + TAU) % TAU);
              if (da > Math.PI) da = TAU - da;
              if (Math.abs(d - h.d) <= h.effR + 1.8 && da <= (h.span * D2R) / 2 + h.effR / h.d) {
                found = i;
                break;
              }
            }
          }
          setHoverIdx(found);
          if (found >= 0 && wrapRef.current) {
            const wr = wrapRef.current.getBoundingClientRect();
            setTipPos({
              left: clamp(e.clientX - wr.left + 14, 8, Math.max(wr.width - 240, 8)),
              top: clamp(e.clientY - wr.top + 14, 8, Math.max(wr.height - 80, 8)),
            });
          } else {
            setTipPos(null);
          }
        }}
        onPointerUp={() => {
          setPanning(false);
          lastClientRef.current = null;
        }}
        onPointerCancel={() => {
          setPanning(false);
          lastClientRef.current = null;
        }}
        onPointerLeave={() => {
          if (!panning) {
            setHoverIdx(-1);
            setTipPos(null);
          }
        }}
        onDoubleClick={() => computeFit()}
      >
        <g id="baseG" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
        <g id="hovG" dangerouslySetInnerHTML={{ __html: hoverMarkup }} />
      </svg>

      {hoveredHole && tipPos && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-[#cfd8e3] bg-white px-2.5 py-1.5 font-mono-num text-[11px] text-slate-800 shadow-md whitespace-nowrap"
          style={{ left: tipPos.left, top: tipPos.top }}
        >
          <div className={`font-semibold ${hoveredHole.kind === 'door' ? 'text-[#154b96]' : 'text-[#b8431a]'}`}>
            {hoveredHole.kind === 'door' ? t('Крепление к двери') : t('Крепление динамика')} ·{' '}
            {hoveredHole.type === 'slot' ? t('паз') : t('отв.')} {hoveredHole.idx}
          </div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-slate-600">
            {hoveredHole.type === 'slot' ? (
              <span>{t('паз {0}° × {1} мм', fmtN(hoveredHole.span, 0), fmtN(hoveredHole.w))}</span>
            ) : (
              <>
                <DiameterIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span>{t('{0} мм', fmtN(hoveredHole.r * 2))}</span>
              </>
            )}
            {!hoveredHole.valid && (
              <span className="ml-1 font-semibold text-red-600">
                · {hoveredHole.overlap ? t('пересечение') : t('вне материала')}
              </span>
            )}
          </div>
          {hoveredHole.cbDepth > 0 && (
            <div className="flex items-center gap-1 text-slate-500">
              {hoveredHole.recessType === 'csk' ? (
                <>
                  <CountersinkIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span>
                    {t(
                      '{0} × 90° (глуб. {1} мм) · {2}',
                      fmtN(hoveredHole.cbR * 2),
                      fmtN(hoveredHole.cbDepth, 1),
                      hoveredHole.bolt !== 'custom' ? t('болт {0}', hoveredHole.bolt) : t('под саморез')
                    )}
                  </span>
                </>
              ) : (
                <>
                  <CounterboreIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span>
                    {t(
                      '{0} × {1} мм · болт {2}',
                      fmtN(hoveredHole.cbR * 2),
                      fmtN(hoveredHole.cbDepth, 1),
                      hoveredHole.bolt
                    )}
                  </span>
                </>
              )}
            </div>
          )}
          <div className="text-slate-400">
            X {fmtN(hoveredHole.cx)} · Y {fmtN(hoveredHole.cy)}
            {t(' мм')}
          </div>
        </div>
      )}
    </div>
  );
});
