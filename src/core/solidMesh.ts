import * as THREE from 'three';
import { clamp, outlineRadiusFn, TAU } from './geometry';
import type { AnalysisResult, HoleInfo, Point2D, SpacerState } from './types';

export interface SpacerSolidResult {
  geometry: THREE.BufferGeometry;
  edgeGeometry: THREE.BufferGeometry | null;
  chamferSize: number;
}

function signedArea2D(pts: Point2D[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    area += x0 * y1 - x1 * y0;
  }
  return area * 0.5;
}

function cleanLoopCCW(raw: Point2D[]): Point2D[] {
  const dedup: Point2D[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const prev = dedup[dedup.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-5) {
      dedup.push([p[0], p[1]]);
    }
  }
  if (dedup.length > 1) {
    const first = dedup[0];
    const last = dedup[dedup.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-5) {
      dedup.pop();
    }
  }
  if (signedArea2D(dedup) < 0) {
    dedup.reverse();
  }
  return dedup;
}

function circleLoopCCW(cx: number, cy: number, r: number, seg: number): Point2D[] {
  const pts: Point2D[] = new Array(seg);
  for (let i = 0; i < seg; i++) {
    const a = (i * TAU) / seg;
    pts[i] = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  return pts;
}

function holeLoopCCW(h: HoleInfo, big: boolean, holeSeg: number): Point2D[] {
  if (h.type === 'circle') {
    return circleLoopCCW(h.cx, h.cy, big ? h.cbR : h.r, holeSeg);
  }
  const src = big && h.cbPts ? h.cbPts : h.pts;
  return cleanLoopCCW(src);
}

function buildOuterLoops(s: SpacerState, outCount: number, bt: number): { outer: Point2D[]; inset: Point2D[] } {
  const fnOut = outlineRadiusFn(s, 0);
  const fnIn = bt > 0 ? outlineRadiusFn(s, bt) : fnOut;
  const outer: Point2D[] = new Array(outCount);
  const inset: Point2D[] = new Array(outCount);

  for (let i = 0; i < outCount; i++) {
    const a = (i * TAU) / outCount;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rOut = fnOut(a);
    outer[i] = [rOut * ca, rOut * sa];
    if (bt > 0) {
      const rRaw = fnIn(a);
      const rMin = Math.max(1, rOut - bt * 1.45);
      const rMax = Math.max(1, rOut - bt * 0.85);
      const rIn = clamp(rRaw, rMin, rMax);
      inset[i] = [rIn * ca, rIn * sa];
    } else {
      inset[i] = outer[i];
    }
  }
  return { outer, inset };
}

/**
 * Computes a safe 45-degree contour chamfer height (in mm) that works even when
 * counterbores are active, clamping automatically if a hole sits very close to
 * the outer or inner contour so top/bottom caps never self-intersect.
 */
export function computeChamferSize(s: SpacerState, a: AnalysisResult, holeSeg = 32): number {
  if (!s.chamfer) return 0;
  let bt = Math.min(1, s.thick / 4);
  const cutout = a.cutValid ? s.innerD / 2 : 0;

  if (cutout > 0) {
    bt = Math.min(bt, (s.outerD - s.innerD) / 4 - 0.25);
  }

  const validHoles = a.holes.filter((h) => h.valid);
  for (let hi = 0; hi < validHoles.length; hi++) {
    const h = validHoles[hi];
    const loops: Point2D[][] = [holeLoopCCW(h, false, holeSeg)];
    if (h.cbDepth > 0) {
      loops.push(holeLoopCCW(h, true, holeSeg));
    }
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const [px, py] = loop[i];
        const dist = Math.hypot(px, py);
        if (cutout > 0) {
          bt = Math.min(bt, dist - cutout - 0.2);
        }
        const rOut = a.rf(Math.atan2(py, px));
        // Account for up to 1.45x polar radial drop on angled ear flanks
        bt = Math.min(bt, (rOut - dist - 0.2) / 1.45);
      }
    }
  }

  return bt >= 0.15 ? +bt.toFixed(3) : 0;
}

class SolidBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];

  pushTri(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    nax: number,
    nay: number,
    naz: number,
    nbx: number,
    nby: number,
    nbz: number,
    ncx: number,
    ncy: number,
    ncz: number,
    uax: number,
    uay: number,
    ubx: number,
    uby: number,
    ucx: number,
    ucy: number
  ) {
    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.normals.push(nax, nay, naz, nbx, nby, nbz, ncx, ncy, ncz);
    this.uvs.push(uax, uay, ubx, uby, ucx, ucy);
  }

  addFlatCap(outerCCW: Point2D[], holesCCW: Point2D[][], z: number, normalZ: 1 | -1) {
    const contourV2 = outerCCW.map((p) => new THREE.Vector2(p[0], p[1]));
    const holesV2 = holesCCW.map((loop) => loop.map((p) => new THREE.Vector2(p[0], p[1])));
    const allPts: Point2D[] = [...outerCCW];
    for (const h of holesCCW) {
      for (const p of h) allPts.push(p);
    }

    const faces = THREE.ShapeUtils.triangulateShape(contourV2, holesV2);
    for (let i = 0; i < faces.length; i++) {
      const [i0, i1, i2] = faces[i];
      const a = allPts[i0];
      const b = allPts[i1];
      const c = allPts[i2];
      // Guarantee winding matches normalZ
      const crossZ = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const flip = normalZ > 0 ? crossZ < 0 : crossZ > 0;
      const p1 = flip ? c : b;
      const p2 = flip ? b : c;
      this.pushTri(
        a[0],
        a[1],
        z,
        p1[0],
        p1[1],
        z,
        p2[0],
        p2[1],
        z,
        0,
        0,
        normalZ,
        0,
        0,
        normalZ,
        0,
        0,
        normalZ,
        a[0],
        a[1],
        p1[0],
        p1[1],
        p2[0],
        p2[1]
      );
    }
  }

  /**
   * Emits a continuous watertight strip between two matched CCW loops A (at zA)
   * and B (at zB). When outward=true (outer ring wall/bevels), outward normals
   * point away from interior; when outward=false (cutout/hole walls), normals
   * point into the opening. Creases steeper than creaseCos split normals sharply.
   */
  addMatchedStrip(loopA: Point2D[], zA: number, loopB: Point2D[], zB: number, outward: boolean, creaseAngleDeg = 22) {
    const n = loopA.length;
    if (n < 3 || loopB.length !== n) return;
    const creaseCos = Math.cos((creaseAngleDeg * Math.PI) / 180);

    // Precompute per-segment outward unit normals and cumulative arc lengths
    const segNormals: [number, number, number][] = new Array(n);
    const arcU: number[] = new Array(n + 1);
    arcU[0] = 0;

    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const a0 = loopA[i];
      const a1 = loopA[next];
      const b0 = loopB[i];

      const tx = a1[0] - a0[0];
      const ty = a1[1] - a0[1];
      const segLen = Math.hypot(tx, ty);
      arcU[i + 1] = arcU[i] + segLen;

      const vx = b0[0] - a0[0];
      const vy = b0[1] - a0[1];
      const vz = zB - zA;

      // Cross (tangent × up) points outward for CCW loops
      let nx = ty * vz;
      let ny = -tx * vz;
      let nz = tx * vy - ty * vx;
      if (!outward) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      segNormals[i] = [nx / nl, ny / nl, nz / nl];
    }

    const v0 = zA;
    const v1 = zB;

    for (let i = 0; i < n; i++) {
      const prev = (i + n - 1) % n;
      const next = (i + 1) % n;
      const nCur = segNormals[i];
      const nPrev = segNormals[prev];
      const nNext = segNormals[next];

      let nStart = nCur;
      if (nCur[0] * nPrev[0] + nCur[1] * nPrev[1] + nCur[2] * nPrev[2] >= creaseCos) {
        const sx = nCur[0] + nPrev[0];
        const sy = nCur[1] + nPrev[1];
        const sz = nCur[2] + nPrev[2];
        const sl = Math.hypot(sx, sy, sz) || 1;
        nStart = [sx / sl, sy / sl, sz / sl];
      }

      let nEnd = nCur;
      if (nCur[0] * nNext[0] + nCur[1] * nNext[1] + nCur[2] * nNext[2] >= creaseCos) {
        const ex = nCur[0] + nNext[0];
        const ey = nCur[1] + nNext[1];
        const ez = nCur[2] + nNext[2];
        const el = Math.hypot(ex, ey, ez) || 1;
        nEnd = [ex / el, ey / el, ez / el];
      }

      const p00 = loopA[i];
      const p10 = loopA[next];
      const p11 = loopB[next];
      const p01 = loopB[i];
      const u0 = arcU[i];
      const u1 = arcU[i + 1];

      if (outward) {
        this.pushTri(
          p00[0],
          p00[1],
          zA,
          p10[0],
          p10[1],
          zA,
          p11[0],
          p11[1],
          zB,
          nStart[0],
          nStart[1],
          nStart[2],
          nEnd[0],
          nEnd[1],
          nEnd[2],
          nEnd[0],
          nEnd[1],
          nEnd[2],
          u0,
          v0,
          u1,
          v0,
          u1,
          v1
        );
        this.pushTri(
          p00[0],
          p00[1],
          zA,
          p11[0],
          p11[1],
          zB,
          p01[0],
          p01[1],
          zB,
          nStart[0],
          nStart[1],
          nStart[2],
          nEnd[0],
          nEnd[1],
          nEnd[2],
          nStart[0],
          nStart[1],
          nStart[2],
          u0,
          v0,
          u1,
          v1,
          u0,
          v1
        );
      } else {
        this.pushTri(
          p00[0],
          p00[1],
          zA,
          p11[0],
          p11[1],
          zB,
          p10[0],
          p10[1],
          zA,
          nStart[0],
          nStart[1],
          nStart[2],
          nEnd[0],
          nEnd[1],
          nEnd[2],
          nEnd[0],
          nEnd[1],
          nEnd[2],
          u0,
          v0,
          u1,
          v1,
          u1,
          v0
        );
        this.pushTri(
          p00[0],
          p00[1],
          zA,
          p01[0],
          p01[1],
          zB,
          p11[0],
          p11[1],
          zB,
          nStart[0],
          nStart[1],
          nStart[2],
          nStart[0],
          nStart[1],
          nStart[2],
          nEnd[0],
          nEnd[1],
          nEnd[2],
          u0,
          v0,
          u0,
          v1,
          u1,
          v1
        );
      }
    }
  }

  /**
   * Emits a flat upward-facing (+Z) annular ring connecting matched inner and
   * outer CCW loops at height z (used for circular counterbore floors).
   */
  addFlatAnnulusUp(innerCCW: Point2D[], outerCCW: Point2D[], z: number) {
    const n = innerCCW.length;
    if (n < 3 || outerCCW.length !== n) return;
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const i0 = innerCCW[i];
      const i1 = innerCCW[next];
      const o0 = outerCCW[i];
      const o1 = outerCCW[next];
      this.pushTri(
        i0[0],
        i0[1],
        z,
        o1[0],
        o1[1],
        z,
        i1[0],
        i1[1],
        z,
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        0,
        1,
        i0[0],
        i0[1],
        o1[0],
        o1[1],
        i1[0],
        i1[1]
      );
      this.pushTri(
        i0[0],
        i0[1],
        z,
        o0[0],
        o0[1],
        z,
        o1[0],
        o1[1],
        z,
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        0,
        1,
        i0[0],
        i0[1],
        o0[0],
        o0[1],
        o1[0],
        o1[1]
      );
    }
  }

  toBufferGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    return geo;
  }
}

function pushLoopEdges(target: number[], loop: Point2D[], z: number) {
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    target.push(a[0], a[1], z, b[0], b[1], z);
  }
}

function pushCreaseVerticalEdges(
  target: number[],
  outer: Point2D[],
  inset: Point2D[],
  thick: number,
  bt: number,
  creaseAngleDeg = 22
) {
  const n = outer.length;
  const cosThresh = Math.cos((creaseAngleDeg * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    const prev = outer[(i + n - 1) % n];
    const cur = outer[i];
    const next = outer[(i + 1) % n];
    const e0x = cur[0] - prev[0];
    const e0y = cur[1] - prev[1];
    const e1x = next[0] - cur[0];
    const e1y = next[1] - cur[1];
    const l0 = Math.hypot(e0x, e0y);
    const l1 = Math.hypot(e1x, e1y);
    if (l0 < 1e-6 || l1 < 1e-6) continue;
    const dot = (e0x * e1x + e0y * e1y) / (l0 * l1);
    if (dot < cosThresh) {
      if (bt > 0) {
        const ic = inset[i];
        target.push(ic[0], ic[1], 0, cur[0], cur[1], bt);
        target.push(cur[0], cur[1], bt, cur[0], cur[1], thick - bt);
        target.push(cur[0], cur[1], thick - bt, ic[0], ic[1], thick);
      } else {
        target.push(cur[0], cur[1], 0, cur[0], cur[1], thick);
      }
    }
  }
}

/**
 * Builds a single watertight manifold 3D solid mesh for the speaker spacer ring,
 * with continuous seam-free inner/outer walls, per-hole counterbore pockets,
 * and optional 45-degree contour chamfer that works alongside counterbores.
 */
export function buildSpacerSolid(
  s: SpacerState,
  a: AnalysisResult,
  seg: number,
  outCount: number,
  forExport: boolean,
  withEdges: boolean
): SpacerSolidResult {
  const thick = s.thick;
  const cutout = a.cutValid ? s.innerD / 2 : 0;
  const validHoles = a.holes.filter((h) => h.valid);
  const holeSeg = Math.max(24, Math.min(64, seg));
  const cutoutSeg = Math.max(48, seg * 2);

  const bt = computeChamferSize(s, a, holeSeg);
  const { outer, inset } = buildOuterLoops(s, outCount, bt);
  const outerCap = bt > 0 ? inset : outer;

  const cutoutWall = cutout > 0 ? circleLoopCCW(0, 0, cutout, cutoutSeg) : null;
  const cutoutCap = cutout > 0 ? (bt > 0 ? circleLoopCCW(0, 0, cutout + bt, cutoutSeg) : cutoutWall) : null;

  const preparedHoles = validHoles.map((h) => {
    const inner = holeLoopCCW(h, false, holeSeg);
    const hasCb = h.cbDepth > 0;
    const cb = hasCb ? holeLoopCCW(h, true, holeSeg) : null;
    const zStep = hasCb ? Math.max(0.5, thick - h.cbDepth) : 0;
    return { h, inner, cb, hasCb, zStep };
  });

  const builder = new SolidBuilder();

  // 1. Top cap (z = thick) and Bottom cap (z = 0)
  const topHoles: Point2D[][] = [];
  const bottomHoles: Point2D[][] = [];
  if (cutoutCap) {
    topHoles.push(cutoutCap);
    bottomHoles.push(cutoutCap);
  }
  for (const ph of preparedHoles) {
    bottomHoles.push(ph.inner);
    topHoles.push(ph.hasCb && ph.cb ? ph.cb : ph.inner);
  }

  builder.addFlatCap(outerCap, topHoles, thick, 1);
  builder.addFlatCap(outerCap, bottomHoles, 0, -1);

  // 2. Outer contour wall (+ optional 45° top & bottom contour bevels)
  if (bt > 0) {
    builder.addMatchedStrip(outerCap, 0, outer, bt, true);
    builder.addMatchedStrip(outer, bt, outer, thick - bt, true);
    builder.addMatchedStrip(outer, thick - bt, outerCap, thick, true);
  } else {
    builder.addMatchedStrip(outer, 0, outer, thick, true);
  }

  // 3. Inner cutout cylinder (+ optional 45° top & bottom contour bevels)
  if (cutoutWall && cutoutCap) {
    if (bt > 0) {
      builder.addMatchedStrip(cutoutCap, 0, cutoutWall, bt, false);
      builder.addMatchedStrip(cutoutWall, bt, cutoutWall, thick - bt, false);
      builder.addMatchedStrip(cutoutWall, thick - bt, cutoutCap, thick, false);
    } else {
      builder.addMatchedStrip(cutoutWall, 0, cutoutWall, thick, false);
    }
  }

  // 4. Individual through-holes, counterbore pockets, and 90° conical countersinks
  for (const ph of preparedHoles) {
    if (ph.hasCb && ph.cb) {
      builder.addMatchedStrip(ph.inner, 0, ph.inner, ph.zStep, false);
      if (ph.h.recessType === 'csk' && ph.inner.length === ph.cb.length) {
        // 90° conical frustum connecting through-hole wall at zStep smoothly to top rim at thick
        builder.addMatchedStrip(ph.inner, ph.zStep, ph.cb, thick, false);
      } else {
        builder.addMatchedStrip(ph.cb, ph.zStep, ph.cb, thick, false);
        if (ph.h.type === 'circle') {
          builder.addFlatAnnulusUp(ph.inner, ph.cb, ph.zStep);
        } else {
          builder.addFlatCap(ph.cb, [ph.inner], ph.zStep, 1);
        }
      }
    } else {
      builder.addMatchedStrip(ph.inner, 0, ph.inner, thick, false);
    }
  }

  const geometry = builder.toBufferGeometry();
  if (!forExport) {
    geometry.rotateX(-Math.PI / 2);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // 5. Crisp analytical CAD feature edges (zero internal seam lines)
  let edgeGeometry: THREE.BufferGeometry | null = null;
  if (!forExport && withEdges) {
    const edgeVerts: number[] = [];

    if (bt > 0) {
      pushLoopEdges(edgeVerts, outerCap, thick);
      pushLoopEdges(edgeVerts, outer, thick - bt);
      pushLoopEdges(edgeVerts, outer, bt);
      pushLoopEdges(edgeVerts, outerCap, 0);
    } else {
      pushLoopEdges(edgeVerts, outer, thick);
      pushLoopEdges(edgeVerts, outer, 0);
    }
    pushCreaseVerticalEdges(edgeVerts, outer, outerCap, thick, bt);

    if (cutoutWall && cutoutCap) {
      if (bt > 0) {
        pushLoopEdges(edgeVerts, cutoutCap, thick);
        pushLoopEdges(edgeVerts, cutoutWall, thick - bt);
        pushLoopEdges(edgeVerts, cutoutWall, bt);
        pushLoopEdges(edgeVerts, cutoutCap, 0);
      } else {
        pushLoopEdges(edgeVerts, cutoutWall, thick);
        pushLoopEdges(edgeVerts, cutoutWall, 0);
      }
    }

    for (const ph of preparedHoles) {
      if (ph.hasCb && ph.cb) {
        pushLoopEdges(edgeVerts, ph.cb, thick);
        if (ph.h.recessType !== 'csk') {
          pushLoopEdges(edgeVerts, ph.cb, ph.zStep);
        }
        pushLoopEdges(edgeVerts, ph.inner, ph.zStep);
        pushLoopEdges(edgeVerts, ph.inner, 0);
      } else {
        pushLoopEdges(edgeVerts, ph.inner, thick);
        pushLoopEdges(edgeVerts, ph.inner, 0);
      }
    }

    edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVerts, 3));
    edgeGeometry.rotateX(-Math.PI / 2);
  }

  return { geometry, edgeGeometry, chamferSize: bt };
}
