import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import type { SceneBgMode } from '../core/types';

export interface ViewCubeHandle {
  syncFromCamera: (viewMatrix: THREE.Matrix4) => void;
}

interface ViewCubeProps {
  sceneBg: SceneBgMode;
  onSelectDirection: (dx: number, dy: number, dz: number) => void;
  onOrbitBy: (dAzimuthRad: number, dPolarRad: number) => void;
  onResetHome: () => void;
}

type Vec3 = [number, number, number];

interface FaceDef {
  id: string;
  label: string;
  aria: string;
  n: Vec3;
  u: Vec3;
  v: Vec3;
  verts: Vec3[];
}

interface HitZoneDef {
  id: string;
  kind: 'face' | 'edge' | 'corner';
  faceId: string;
  ariaLabel: string;
  dir: Vec3;
  normal: Vec3;
  verts: Vec3[];
}

interface AxisDef {
  key: 'X' | 'Y' | 'Z';
  start: Vec3;
  end: Vec3;
  labelPos: Vec3;
  colorLight: string;
  colorDark: string;
}

const SVG_SIZE = 104;
const CX = 55;
const CY = 52;
const SCALE = 21.5;
const FOCAL = 28;
const INNER = 0.72; // Inner face zone; outer 0.72..1.0 forms Fusion-style edge/corner hit pads

const SVG_NS = 'http://www.w3.org/2000/svg';

function addVec(a: Vec3, b: Vec3, s = 1): Vec3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

function dirTitle(dx: number, dy: number, dz: number): string {
  const parts: string[] = [];
  if (dy > 0) parts.push('Сверху');
  else if (dy < 0) parts.push('Снизу');
  if (dz > 0) parts.push('Спереди');
  else if (dz < 0) parts.push('Сзади');
  if (dx < 0) parts.push('Слева');
  else if (dx > 0) parts.push('Справа');
  return parts.join(' · ');
}

const MAIN_FACES: FaceDef[] = (
  [
    { id: 'f-front', label: 'СПЕРЕДИ', aria: 'Вид спереди', n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { id: 'f-back', label: 'СЗАДИ', aria: 'Вид сзади', n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { id: 'f-right', label: 'СПРАВА', aria: 'Вид справа', n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { id: 'f-left', label: 'СЛЕВА', aria: 'Вид слева', n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { id: 'f-top', label: 'СВЕРХУ', aria: 'Вид сверху', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { id: 'f-bottom', label: 'СНИЗУ', aria: 'Вид снизу', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  ] as const
).map((f) => {
  const n: Vec3 = [f.n[0], f.n[1], f.n[2]];
  const u: Vec3 = [f.u[0], f.u[1], f.u[2]];
  const v: Vec3 = [f.v[0], f.v[1], f.v[2]];
  return {
    id: f.id,
    label: f.label,
    aria: f.aria,
    n,
    u,
    v,
    verts: [
      addVec(addVec(n, u, -1), v, -1),
      addVec(addVec(n, u, 1), v, -1),
      addVec(addVec(n, u, 1), v, 1),
      addVec(addVec(n, u, -1), v, 1),
    ],
  };
});

// Build 9 Fusion-style interactive sub-patches per face (1 center + 4 edges + 4 corners).
// Adjacent patches share the same logical `id` (e.g. "c-1,1,1") so hovering a corner highlights
// all 3 meeting corner squares simultaneously—exactly like Autodesk Fusion 360.
function buildHitZones(): HitZoneDef[] {
  const zones: HitZoneDef[] = [];
  const bands: [number, number, -1 | 0 | 1][] = [
    [-1, -INNER, -1],
    [-INNER, INNER, 0],
    [INNER, 1, 1],
  ];

  for (const f of MAIN_FACES) {
    for (const [u0, u1, su] of bands) {
      for (const [v0, v1, sv] of bands) {
        const dir: Vec3 = [
          f.n[0] + f.u[0] * su + f.v[0] * sv,
          f.n[1] + f.u[1] * su + f.v[1] * sv,
          f.n[2] + f.u[2] * su + f.v[2] * sv,
        ];
        const nzCount = (su !== 0 ? 1 : 0) + (sv !== 0 ? 1 : 0);
        const kind: HitZoneDef['kind'] = nzCount === 0 ? 'face' : nzCount === 1 ? 'edge' : 'corner';
        const id = kind === 'face' ? f.id : `${kind[0]}-${dir.join(',')}`;
        const ariaLabel = kind === 'face' ? f.aria : `Вид: ${dirTitle(dir[0], dir[1], dir[2])}`;

        zones.push({
          id,
          kind,
          faceId: f.id,
          ariaLabel,
          dir,
          normal: f.n,
          verts: [
            addVec(addVec(f.n, f.u, u0), f.v, v0),
            addVec(addVec(f.n, f.u, u1), f.v, v0),
            addVec(addVec(f.n, f.u, u1), f.v, v1),
            addVec(addVec(f.n, f.u, u0), f.v, v1),
          ],
        });
      }
    }
  }
  return zones;
}

const HIT_ZONES = buildHitZones();

// Fusion 360 style CAD axis triad anchored at the cube's bottom-left-front corner (-1, -1, +1)
// CAD mapping: X = right (red), Y = depth (green), Z = height/up (blue)
const AXIS_ORIGIN: Vec3 = [-1.02, -1.02, 1.02];
const AXES: AxisDef[] = [
  {
    key: 'X',
    start: AXIS_ORIGIN,
    end: [1.34, -1.02, 1.02],
    labelPos: [1.62, -1.02, 1.02],
    colorLight: '#ef4444',
    colorDark: '#f87171',
  },
  {
    key: 'Y',
    start: AXIS_ORIGIN,
    end: [-1.02, -1.02, -1.34],
    labelPos: [-1.02, -1.02, -1.62],
    colorLight: '#16a34a',
    colorDark: '#4ade80',
  },
  {
    key: 'Z',
    start: AXIS_ORIGIN,
    end: [-1.02, 1.34, 1.02],
    labelPos: [-1.02, 1.64, 1.02],
    colorLight: '#2563eb',
    colorDark: '#60a5fa',
  },
];

const INITIAL_VIEW_MATRIX = new THREE.Matrix4()
  .lookAt(new THREE.Vector3(22, 16, 24), new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(0, 1, 0))
  .invert();

export const ViewCube = forwardRef<ViewCubeHandle, ViewCubeProps>(function ViewCube(
  { sceneBg, onSelectDirection, onOrbitBy, onResetHome },
  ref
) {
  const backAxesRef = useRef<SVGGElement>(null);
  const cubeLayerRef = useRef<SVGGElement>(null);
  const frontAxesRef = useRef<SVGGElement>(null);
  const [dragging, setDragging] = useState(false);

  const sceneBgRef = useRef(sceneBg);
  sceneBgRef.current = sceneBg;
  const hoverIdRef = useRef<string | null>(null);
  const lastViewMatrixRef = useRef<THREE.Matrix4>(INITIAL_VIEW_MATRIX.clone());

  const callbacksRef = useRef({ onSelectDirection, onOrbitBy });
  callbacksRef.current = { onSelectDirection, onOrbitBy };

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    pendingDir: Vec3 | null;
  } | null>(null);

  const faceNodesRef = useRef<
    Map<
      string,
      {
        group: SVGGElement;
        poly: SVGPolygonElement;
        text: SVGTextElement;
        def: FaceDef;
        zones: { poly: SVGPolygonElement; def: HitZoneDef }[];
      }
    >
  >(new Map());

  const axisNodesRef = useRef<
    Map<
      string,
      {
        group: SVGGElement;
        line: SVGLineElement;
        label: SVGTextElement;
        def: AxisDef;
      }
    >
  >(new Map());

  const renderProjection = useCallback((viewMatrix: THREE.Matrix4) => {
    const cubeLayer = cubeLayerRef.current;
    const backAxes = backAxesRef.current;
    const frontAxes = frontAxesRef.current;
    if (!cubeLayer || !backAxes || !frontAxes) return;

    const e = viewMatrix.elements;
    const isDark = sceneBgRef.current === 'dark';

    const project = (x: number, y: number, z: number) => {
      const cx = e[0] * x + e[4] * y + e[8] * z;
      const cy = e[1] * x + e[5] * y + e[9] * z;
      const cz = e[2] * x + e[6] * y + e[10] * z;
      const s = SCALE * (FOCAL / (FOCAL - cz));
      return {
        sx: CX + cx * s,
        sy: CY - cy * s,
        cz,
      };
    };

    const visibleFaces: { group: SVGGElement; avgZ: number }[] = [];
    const hoveredId = hoverIdRef.current;

    for (const entry of faceNodesRef.current.values()) {
      const { group, poly, text, def, zones } = entry;
      const nz = e[2] * def.n[0] + e[6] * def.n[1] + e[10] * def.n[2];

      if (nz <= 0.01) {
        group.style.display = 'none';
        continue;
      }

      group.style.display = '';
      let sumZ = 0;
      const pts: string[] = [];
      for (const v of def.verts) {
        const p = project(v[0], v[1], v[2]);
        sumZ += p.cz;
        pts.push(`${p.sx.toFixed(2)},${p.sy.toFixed(2)}`);
      }
      poly.setAttribute('points', pts.join(' '));

      const faceHovered = hoveredId === def.id;
      if (faceHovered) {
        poly.setAttribute('fill', isDark ? '#2b476b' : '#d8e6f8');
        poly.setAttribute('stroke', isDark ? '#60a5fa' : '#475569');
      } else if (isDark) {
        const lightDot = def.n[0] * 0.22 + def.n[1] * 0.82 + def.n[2] * 0.52;
        const lum = Math.round(Math.max(40, Math.min(76, 54 + lightDot * 16)));
        poly.setAttribute('fill', `rgb(${lum}, ${lum + 5}, ${lum + 13})`);
        poly.setAttribute('stroke', '#64748b');
      } else {
        // Matte Autodesk Fusion light-gray faces with crisp charcoal edges
        const lightDot = def.n[0] * 0.22 + def.n[1] * 0.82 + def.n[2] * 0.52;
        const lum = Math.round(Math.max(204, Math.min(242, 224 + lightDot * 15)));
        poly.setAttribute('fill', `rgb(${lum}, ${lum + 2}, ${lum + 4})`);
        poly.setAttribute('stroke', '#6b7785');
      }
      poly.setAttribute('stroke-width', '0.9');

      // Project crisp uppercase face label onto face plane
      const pC = project(def.n[0], def.n[1], def.n[2]);
      const pU = project(def.n[0] + def.u[0] * 0.5, def.n[1] + def.u[1] * 0.5, def.n[2] + def.u[2] * 0.5);
      const pD = project(def.n[0] - def.v[0] * 0.5, def.n[1] - def.v[1] * 0.5, def.n[2] - def.v[2] * 0.5);
      const ma = ((pU.sx - pC.sx) * 2) / SCALE;
      const mb = ((pU.sy - pC.sy) * 2) / SCALE;
      const mc = ((pD.sx - pC.sx) * 2) / SCALE;
      const md = ((pD.sy - pC.sy) * 2) / SCALE;

      text.setAttribute(
        'transform',
        `matrix(${ma.toFixed(4)} ${mb.toFixed(4)} ${mc.toFixed(4)} ${md.toFixed(4)} ${pC.sx.toFixed(2)} ${pC.sy.toFixed(2)})`
      );
      const alpha = Math.max(0, Math.min(1, (nz - 0.22) / 0.24));
      text.setAttribute('opacity', alpha.toFixed(2));
      text.setAttribute(
        'fill',
        isDark ? (faceHovered ? '#f8fafc' : '#e2e8f0') : faceHovered ? '#1e3a8a' : '#3d4856'
      );

      // Update translucent edge/corner interactive pads on top of the sharp face
      for (const z of zones) {
        const zPts: string[] = [];
        for (const v of z.def.verts) {
          const p = project(v[0], v[1], v[2]);
          zPts.push(`${p.sx.toFixed(2)},${p.sy.toFixed(2)}`);
        }
        z.poly.setAttribute('points', zPts.join(' '));
        const isZoneHovered = z.def.kind !== 'face' && hoveredId === z.def.id;
        if (isZoneHovered) {
          z.poly.setAttribute('fill', isDark ? 'rgba(96, 165, 250, 0.45)' : 'rgba(130, 166, 206, 0.52)');
        } else {
          z.poly.setAttribute('fill', 'transparent');
        }
      }

      visibleFaces.push({ group, avgZ: sumZ / 4 });
    }

    visibleFaces.sort((a, b) => a.avgZ - b.avgZ);
    for (const item of visibleFaces) {
      cubeLayer.appendChild(item.group);
    }

    // Update Fusion-style X/Y/Z axis triad, depth-sorted behind or in front of the cube
    for (const entry of axisNodesRef.current.values()) {
      const { group, line, label, def } = entry;
      const p0 = project(def.start[0], def.start[1], def.start[2]);
      const p1 = project(def.end[0], def.end[1], def.end[2]);
      const pL = project(def.labelPos[0], def.labelPos[1], def.labelPos[2]);
      const midZ = (p0.cz + p1.cz) * 0.5;
      const color = isDark ? def.colorDark : def.colorLight;

      line.setAttribute('x1', p0.sx.toFixed(2));
      line.setAttribute('y1', p0.sy.toFixed(2));
      line.setAttribute('x2', p1.sx.toFixed(2));
      line.setAttribute('y2', p1.sy.toFixed(2));
      line.setAttribute('stroke', color);

      label.setAttribute('x', pL.sx.toFixed(2));
      label.setAttribute('y', pL.sy.toFixed(2));
      label.setAttribute('fill', color);

      // Axes whose midpoint lies in front of the cube center stay crisp in front; occluded ones go behind
      if (midZ >= -0.05) {
        group.setAttribute('opacity', '1');
        frontAxes.appendChild(group);
      } else {
        group.setAttribute('opacity', '0.55');
        backAxes.appendChild(group);
      }
    }
  }, []);

  useEffect(() => {
    const cubeLayer = cubeLayerRef.current;
    const backAxes = backAxesRef.current;
    const frontAxes = frontAxesRef.current;
    if (!cubeLayer || !backAxes || !frontAxes) return;

    cubeLayer.innerHTML = '';
    backAxes.innerHTML = '';
    frontAxes.innerHTML = '';
    faceNodesRef.current.clear();
    axisNodesRef.current.clear();

    const zonesByFace = new Map<string, HitZoneDef[]>();
    for (const z of HIT_ZONES) {
      const list = zonesByFace.get(z.faceId) ?? [];
      list.push(z);
      zonesByFace.set(z.faceId, list);
    }

    const bindInteractions = (el: SVGElement, id: string, dir: Vec3) => {
      el.addEventListener('pointerenter', () => {
        if (dragRef.current) return;
        hoverIdRef.current = id;
        renderProjection(lastViewMatrixRef.current);
      });
      el.addEventListener('pointerleave', () => {
        if (hoverIdRef.current === id) {
          hoverIdRef.current = null;
          renderProjection(lastViewMatrixRef.current);
        }
      });
      el.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        ev.stopPropagation();
        dragRef.current = {
          pointerId: ev.pointerId,
          startX: ev.clientX,
          startY: ev.clientY,
          lastX: ev.clientX,
          lastY: ev.clientY,
          moved: false,
          pendingDir: dir,
        };
        el.setPointerCapture?.(ev.pointerId);
      });
      el.addEventListener('pointermove', (ev) => {
        const d = dragRef.current;
        if (!d || d.pointerId !== ev.pointerId) return;
        const dxTotal = ev.clientX - d.startX;
        const dyTotal = ev.clientY - d.startY;
        if (!d.moved && Math.hypot(dxTotal, dyTotal) >= 4) {
          d.moved = true;
          setDragging(true);
          hoverIdRef.current = null;
        }
        if (d.moved) {
          const dx = ev.clientX - d.lastX;
          const dy = ev.clientY - d.lastY;
          d.lastX = ev.clientX;
          d.lastY = ev.clientY;
          callbacksRef.current.onOrbitBy(dx * 0.011, dy * 0.011);
        }
      });
      el.addEventListener('pointerup', (ev) => {
        const d = dragRef.current;
        if (!d || d.pointerId !== ev.pointerId) return;
        dragRef.current = null;
        setDragging(false);
        el.releasePointerCapture?.(ev.pointerId);
        if (!d.moved && d.pendingDir) {
          callbacksRef.current.onSelectDirection(d.pendingDir[0], d.pendingDir[1], d.pendingDir[2]);
        }
      });
      el.addEventListener('pointercancel', (ev) => {
        const d = dragRef.current;
        if (d && d.pointerId === ev.pointerId) {
          dragRef.current = null;
          setDragging(false);
        }
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          callbacksRef.current.onSelectDirection(dir[0], dir[1], dir[2]);
        }
      });
    };

    for (const def of MAIN_FACES) {
      const group = document.createElementNS(SVG_NS, 'g');

      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('stroke-linejoin', 'miter');
      poly.setAttribute('pointer-events', 'none');
      group.appendChild(poly);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', '0');
      text.setAttribute('y', '0');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', '7.6');
      text.setAttribute('font-weight', '700');
      text.setAttribute('font-family', 'IBM Plex Sans, system-ui, sans-serif');
      text.setAttribute('letter-spacing', '0.02em');
      text.setAttribute('text-rendering', 'geometricPrecision');
      text.setAttribute('pointer-events', 'none');
      text.textContent = def.label;
      group.appendChild(text);

      const zoneEntries: { poly: SVGPolygonElement; def: HitZoneDef }[] = [];
      for (const zDef of zonesByFace.get(def.id) ?? []) {
        const zPoly = document.createElementNS(SVG_NS, 'polygon');
        zPoly.setAttribute('role', 'button');
        zPoly.setAttribute('tabindex', zDef.kind === 'face' ? '0' : '-1');
        zPoly.setAttribute('aria-label', zDef.ariaLabel);
        zPoly.setAttribute('fill', 'transparent');
        zPoly.style.cursor = 'pointer';
        zPoly.style.outline = 'none';

        const title = document.createElementNS(SVG_NS, 'title');
        title.textContent = zDef.ariaLabel;
        zPoly.appendChild(title);

        bindInteractions(zPoly, zDef.id, zDef.dir);
        group.appendChild(zPoly);
        zoneEntries.push({ poly: zPoly, def: zDef });
      }

      cubeLayer.appendChild(group);
      faceNodesRef.current.set(def.id, { group, poly, text, def, zones: zoneEntries });
    }

    for (const def of AXES) {
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('pointer-events', 'none');

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('stroke-width', '1.8');
      line.setAttribute('stroke-linecap', 'round');
      group.appendChild(line);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.setAttribute('font-size', '9.5');
      label.setAttribute('font-weight', '700');
      label.setAttribute('font-family', 'IBM Plex Sans, system-ui, sans-serif');
      label.textContent = def.key;
      group.appendChild(label);

      frontAxes.appendChild(group);
      axisNodesRef.current.set(def.key, { group, line, label, def });
    }

    renderProjection(lastViewMatrixRef.current);
  }, [renderProjection]);

  useEffect(() => {
    renderProjection(lastViewMatrixRef.current);
  }, [sceneBg, renderProjection]);

  useImperativeHandle(
    ref,
    () => ({
      syncFromCamera: (viewMatrix: THREE.Matrix4) => {
        lastViewMatrixRef.current.copy(viewMatrix);
        renderProjection(viewMatrix);
      },
    }),
    [renderProjection]
  );

  const isDark = sceneBg === 'dark';

  return (
    <div
      className={`group pointer-events-auto relative select-none ${dragging ? 'cursor-grabbing' : ''}`}
      style={{ width: SVG_SIZE, height: SVG_SIZE, touchAction: 'none' }}
      aria-label="Навигационный куб вида"
      onPointerLeave={() => {
        if (!dragRef.current && hoverIdRef.current) {
          hoverIdRef.current = null;
          renderProjection(lastViewMatrixRef.current);
        }
      }}
    >
      {/* Fusion-style bare architectural Home icon (no heavy button card box) */}
      <button
        type="button"
        onClick={onResetHome}
        title="Исходный изометрический вид"
        aria-label="Исходный изометрический вид"
        className="group/home absolute left-0.5 top-0 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md opacity-90 hover:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e63c4]/50 transition-transform hover:scale-105 cursor-pointer"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 drop-shadow-[0_1px_2px_rgba(15,23,42,0.18)]"
          aria-hidden="true"
        >
          <path
            d="M3 11.5L12 4l9 7.5h-2.5V20h-13v-8.5H3z"
            className={
              isDark
                ? 'fill-[#2b3440] stroke-slate-300 group-hover/home:fill-[#1e3a5f] group-hover/home:stroke-blue-300 transition-colors'
                : 'fill-white stroke-[#6b7785] group-hover/home:fill-[#dbeafe] group-hover/home:stroke-[#1d4ed8] transition-colors'
            }
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <rect
            x="10.2"
            y="13.8"
            width="3.6"
            height="6.2"
            rx="0.5"
            className={
              isDark
                ? 'fill-slate-400 group-hover/home:fill-blue-300 transition-colors'
                : 'fill-[#6b7785] group-hover/home:fill-[#1d4ed8] transition-colors'
            }
          />
        </svg>
      </button>

      {/* Sharp Fusion 360 ViewCube with X/Y/Z Axis Triad */}
      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        className="h-full w-full overflow-visible"
      >
        <g ref={backAxesRef} />
        <g
          ref={cubeLayerRef}
          className={
            isDark
              ? 'drop-shadow-[0_5px_10px_rgba(0,0,0,0.5)]'
              : 'drop-shadow-[0_6px_10px_rgba(15,23,42,0.18)]'
          }
        />
        <g ref={frontAxesRef} />
      </svg>
    </div>
  );
});
