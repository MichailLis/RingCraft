import test from 'node:test';
import assert from 'node:assert/strict';
import type * as THREE from 'three';
import { DEFAULTS, PRESETS } from './constants';
import { analyze, sanitizeState } from './geometry';
import { buildSpacerSolid, computeChamferSize } from './solidMesh';

function analyzeManifold(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position.array;
  const edgeCounts = new Map<string, number>();
  let signedVol6 = 0;

  const q = (v: number) => Math.round(v * 1000);
  const vKey = (i: number) => `${q(pos[i])},${q(pos[i + 1])},${q(pos[i + 2])}`;

  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i],
      ay = pos[i + 1],
      az = pos[i + 2];
    const bx = pos[i + 3],
      by = pos[i + 4],
      bz = pos[i + 5];
    const cx = pos[i + 6],
      cy = pos[i + 7],
      cz = pos[i + 8];
    signedVol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);

    const k0 = vKey(i);
    const k1 = vKey(i + 3);
    const k2 = vKey(i + 6);
    for (const [u, v] of [
      [k0, k1],
      [k1, k2],
      [k2, k0],
    ]) {
      const forward = `${u}>${v}`;
      edgeCounts.set(forward, (edgeCounts.get(forward) ?? 0) + 1);
    }
  }

  let unmatchedEdges = 0;
  let duplicateDirected = 0;
  for (const [edge, count] of edgeCounts) {
    if (count !== 1) duplicateDirected += count - 1;
    const [u, v] = edge.split('>');
    const twin = `${v}>${u}`;
    if (edgeCounts.get(twin) !== count) {
      unmatchedEdges++;
    }
  }

  return {
    triCount: pos.length / 9,
    volumeMm3: signedVol6 / 6,
    unmatchedEdges,
    duplicateDirected,
  };
}

test('buildSpacerSolid produces watertight closed manifold with chamfer AND active counterbores', () => {
  const s = sanitizeState({
    ...DEFAULTS,
    chamfer: true,
    doorBolt: 'M5',
    doorRecess: 'flush',
    spkBolt: 'M4',
    spkRecess: 'deep',
  });
  const a = analyze(s);
  assert.equal(a.nErr, 0);
  assert.equal(computeChamferSize(s, a), 1);

  const built = buildSpacerSolid(s, a, 32, 180, true, false);
  const stats = analyzeManifold(built.geometry);

  assert.equal(built.chamferSize, 1);
  assert.equal(stats.unmatchedEdges, 0, 'Export STL mesh must have zero open boundary edges');
  assert.equal(stats.duplicateDirected, 0, 'Export STL mesh must have zero non-manifold duplicate half-edges');
  assert.ok(stats.volumeMm3 > 100000, `Expected positive physical volume in mm³, got ${stats.volumeMm3}`);

  built.geometry.dispose();
});

test('buildSpacerSolid has zero intermediate horizontal seam lines inside cutout wall with dual-depth counterbores', () => {
  const s = sanitizeState({
    ...DEFAULTS,
    thick: 16,
    chamfer: false,
    doorBolt: 'M5',
    doorRecess: 'flush', // step at y = 11
    spkBolt: 'M4',
    spkRecess: 'deep', // step at y = 11? Wait: M4 k=4, deep=5 -> y=11; let's use M6 deep (7 -> y=9) so two distinct depths!
  });
  const dualDepth = sanitizeState({
    ...s,
    doorBolt: 'M6',
    doorRecess: 'deep', // depth 7 -> y = 9
    spkBolt: 'M4',
    spkRecess: 'flush', // depth 4 -> y = 12
    earMargin: 8,
  });
  const a = analyze(dualDepth);
  const built = buildSpacerSolid(dualDepth, a, 32, 180, false, true);
  assert.ok(built.edgeGeometry, 'Expected CAD edge geometry for 3D display');

  const cutoutR = dualDepth.innerD / 2;
  const pos = built.edgeGeometry.attributes.position.array;
  let midCutoutSeamSegments = 0;

  for (let i = 0; i < pos.length; i += 6) {
    const y0 = pos[i + 1];
    const y1 = pos[i + 4];
    const r0 = Math.hypot(pos[i], pos[i + 2]);
    const r1 = Math.hypot(pos[i + 3], pos[i + 5]);
    const isCutoutRadius = Math.abs(r0 - cutoutR) < 0.5 && Math.abs(r1 - cutoutR) < 0.5;
    const isInteriorHeight = y0 > 0.05 && y0 < dualDepth.thick - 0.05 && Math.abs(y0 - y1) < 0.05;
    if (isCutoutRadius && isInteriorHeight) {
      midCutoutSeamSegments++;
    }
  }

  assert.equal(midCutoutSeamSegments, 0, 'Inner cutout wall must have zero intermediate horizontal seam edges');
  built.geometry.dispose();
  built.edgeGeometry.dispose();
});

test('buildSpacerSolid produces watertight manifold for slotted counterbores and all built-in presets', () => {
  const slotted = sanitizeState({
    ...DEFAULTS,
    chamfer: true,
    doorSlots: true,
    slotAngle: 20,
    doorBolt: 'M5',
    doorRecess: 'flush',
    spkSlots: true,
    spkSlotAngle: 14,
    spkBolt: 'M4',
    spkRecess: 'flush',
  });
  const aSlotted = analyze(slotted);
  const builtSlotted = buildSpacerSolid(slotted, aSlotted, 28, 180, true, false);
  const statsSlotted = analyzeManifold(builtSlotted.geometry);
  assert.equal(statsSlotted.unmatchedEdges, 0, 'Slotted counterbored solid must be watertight');
  assert.equal(statsSlotted.duplicateDirected, 0);
  assert.ok(statsSlotted.volumeMm3 > 80000);
  builtSlotted.geometry.dispose();

  for (const preset of PRESETS) {
    const s = sanitizeState({ ...DEFAULTS, ...preset.p });
    const a = analyze(s);
    const built = buildSpacerSolid(s, a, 24, 144, true, false);
    const st = analyzeManifold(built.geometry);
    assert.equal(st.unmatchedEdges, 0, `Preset "${preset.name}" must produce watertight solid`);
    assert.equal(st.duplicateDirected, 0, `Preset "${preset.name}" must have no duplicate half-edges`);
    assert.ok(st.volumeMm3 > 0, `Preset "${preset.name}" must have positive outward volume`);
    built.geometry.dispose();
  }
});

test('buildSpacerSolid produces watertight closed manifold for circular and slotted 90-degree countersinks', () => {
  const cskCirc = sanitizeState({
    ...DEFAULTS,
    chamfer: true,
    doorBolt: 'M5',
    doorRecess: 'csk',
    spkBolt: 'custom',
    spkHoleD: 4.2,
    spkRecess: 'csk_deep',
  });
  const aCirc = analyze(cskCirc);
  assert.equal(aCirc.nErr, 0);
  const builtCirc = buildSpacerSolid(cskCirc, aCirc, 32, 180, true, false);
  const stCirc = analyzeManifold(builtCirc.geometry);
  assert.equal(stCirc.unmatchedEdges, 0, 'Circular countersunk solid must be watertight');
  assert.equal(stCirc.duplicateDirected, 0);
  assert.ok(stCirc.volumeMm3 > 100000);
  builtCirc.geometry.dispose();

  // Verify analytical CAD display edges emit no flat counterbore outer-radius ring at zStep for 90° cones
  const builtCircDisp = buildSpacerSolid(cskCirc, aCirc, 24, 144, false, true);
  assert.ok(builtCircDisp.edgeGeometry, 'Expected CAD edge geometry for circular countersunk display');
  const doorFast = aCirc.fd;
  const zStepDoor = cskCirc.thick - doorFast.cbDepth;
  const edgePos = builtCircDisp.edgeGeometry.attributes.position.array;
  const h0 = aCirc.holes.find((h) => h.kind === 'door' && h.type === 'circle');
  assert.ok(h0 && h0.type === 'circle', 'Expected circular door hole');
  let spuriousFloorSegments = 0;
  for (let i = 0; i < edgePos.length; i += 6) {
    const y0 = edgePos[i + 1];
    const y1 = edgePos[i + 4];
    if (Math.abs(y0 - zStepDoor) < 0.02 && Math.abs(y1 - zStepDoor) < 0.02) {
      // Check distance from first door hole center; at zStepDoor only the inner hole radius should exist, never cbR
      const d0 = Math.hypot(edgePos[i] - h0.cx, -edgePos[i + 2] - h0.cy);
      if (Math.abs(d0 - doorFast.cbD / 2) < 0.15) {
        spuriousFloorSegments++;
      }
    }
  }
  assert.equal(spuriousFloorSegments, 0, 'Conical countersink must not emit a flat counterbore outer ring at zStep');
  builtCircDisp.geometry.dispose();
  builtCircDisp.edgeGeometry.dispose();

  // Slotted 90-degree countersinks on a generously spaced spacer
  const cskSlotted = sanitizeState({
    ...DEFAULTS,
    outerD: 204,
    innerD: 146,
    doorBCD: 186,
    spkBCD: 162,
    earMargin: 8,
    chamfer: true,
    doorSlots: true,
    slotAngle: 18,
    doorBolt: 'M5',
    doorRecess: 'csk',
    spkSlots: true,
    spkSlotAngle: 14,
    spkBolt: 'M4',
    spkRecess: 'csk',
  });
  const aSlot = analyze(cskSlotted);
  assert.equal(aSlot.nErr, 0);
  const builtSlot = buildSpacerSolid(cskSlotted, aSlot, 28, 180, true, false);
  const stSlot = analyzeManifold(builtSlot.geometry);
  assert.equal(stSlot.unmatchedEdges, 0, 'Slotted countersunk solid must be watertight');
  assert.equal(stSlot.duplicateDirected, 0);
  assert.ok(stSlot.volumeMm3 > 80000);
  builtSlot.geometry.dispose();
});

test('buildSpacerSolid produces watertight closed manifold for arbitrary tiny (Ø78) and large (Ø420) rings', () => {
  const tiny = sanitizeState({
    ...DEFAULTS,
    outerD: 78,
    innerD: 52,
    thick: 8,
    doorBCD: 68,
    doorN: 3,
    doorBolt: 'M3',
    doorRecess: 'csk',
    spkBCD: 62,
    spkN: 4,
    spkBolt: 'custom',
    spkHoleD: 3.2,
    spkRecess: 'none',
    ears: true,
    earMargin: 4.5,
  });
  const aTiny = analyze(tiny);
  assert.equal(aTiny.nErr, 0);
  const bTiny = buildSpacerSolid(tiny, aTiny, 24, 144, true, false);
  const stTiny = analyzeManifold(bTiny.geometry);
  assert.equal(stTiny.unmatchedEdges, 0, 'Tiny Ø78 solid must be watertight');
  assert.equal(stTiny.duplicateDirected, 0);
  assert.ok(stTiny.volumeMm3 > 10000);
  bTiny.geometry.dispose();

  const huge = sanitizeState({
    ...DEFAULTS,
    outerD: 420,
    innerD: 340,
    thick: 45,
    doorBCD: 396,
    doorN: 6,
    doorBolt: 'M8',
    doorRecess: 'flush',
    spkBCD: 368,
    spkN: 8,
    spkBolt: 'M6',
    spkRecess: 'csk',
    ears: true,
    earMargin: 10,
  });
  const aHuge = analyze(huge);
  assert.equal(aHuge.nErr, 0);
  const bHuge = buildSpacerSolid(huge, aHuge, 28, 180, true, false);
  const stHuge = analyzeManifold(bHuge.geometry);
  assert.equal(stHuge.unmatchedEdges, 0, 'Large Ø420 solid must be watertight');
  assert.equal(stHuge.duplicateDirected, 0);
  assert.ok(stHuge.volumeMm3 > 1000000);
  bHuge.geometry.dispose();
});
