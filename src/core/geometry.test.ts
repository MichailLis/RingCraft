import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS } from './constants';
import {
  analyze,
  areLayerCountsCompatible,
  buildDXF,
  buildFileBase,
  fastFor,
  isDoorAutoShifted,
  isLayerRotationOptimal,
  layerDesc,
  layerHoleAnglesDeg,
  layerTabDesc,
  minActualCrossLayerGapDeg,
  optimalLayerPairRotations,
  optimalLayerRotation,
  outlinePts,
  ringCenterBCD,
  sanitizeState,
  slotPts,
} from './geometry';

test('sanitizeState clamps out-of-range dimensions and enforces ISO 273 bolt clearance', () => {
  const s = sanitizeState({
    outerD: 999,
    innerD: 10,
    thick: 2,
    doorBolt: 'M6',
    doorHoleD: 1.5,
    doorN: 3.7,
    material: 'invalid' as never,
  });
  assert.equal(s.outerD, 500);
  assert.equal(s.innerD, 25);
  assert.equal(s.thick, 3);
  assert.equal(s.doorHoleD, 6.6);
  assert.equal(s.doorN, 4);
  assert.equal(s.material, 'fanera');
});

test('fastFor calculates counterbore diameter, nominal depth, and clamped actualCbDepth', () => {
  const flush = fastFor({ ...DEFAULTS, thick: 16, doorBolt: 'M5', doorRecess: 'flush', doorHeadClear: 0.5 }, 'door');
  assert.equal(flush.active, true);
  assert.equal(flush.cbD, 9.0);
  assert.equal(flush.cbDepth, 5);
  assert.equal(flush.actualCbDepth, 5);

  const deep = fastFor({ ...DEFAULTS, thick: 16, doorBolt: 'M5', doorRecess: 'deep', doorHeadClear: 0.5 }, 'door');
  assert.equal(deep.cbDepth, 6);
  assert.equal(deep.actualCbDepth, 6);

  const clamped = fastFor({ ...DEFAULTS, thick: 3, doorBolt: 'M5', doorRecess: 'flush', doorHeadClear: 0.5 }, 'door');
  assert.equal(clamped.cbDepth, 5);
  assert.equal(clamped.actualCbDepth, 2.5);

  const custom = fastFor({ ...DEFAULTS, spkBolt: 'custom', spkRecess: 'flush' }, 'spk');
  assert.equal(custom.active, false);
  assert.equal(custom.actualCbDepth, 0);
});

test('analyze passes all built-in presets with zero errors', () => {
  for (const preset of PRESETS) {
    const state = sanitizeState({ ...DEFAULTS, ...preset.p });
    const res = analyze(state);
    assert.equal(res.nErr, 0, `Preset "${preset.name}" should have 0 errors`);
    assert.equal(res.cutValid, true);
    assert.equal(res.holes.length, state.doorN + state.spkN);
  }
});

test('analyze detects hole overlap between Door and Speaker layers', () => {
  const colliding = sanitizeState({
    ...DEFAULTS,
    doorBCD: 160,
    doorN: 4,
    doorRot: 0,
    spkBCD: 160,
    spkN: 4,
    spkRot: 0,
  });
  const res = analyze(colliding);
  assert.ok(res.nErr > 0, 'Expected overlap error when BCD and angles match');
  assert.ok(res.holes.some((h) => h.overlap));
});

test('analyze detects insufficient floor thickness under counterbore and propagates clamped depth', () => {
  const thin = sanitizeState({
    ...DEFAULTS,
    thick: 3,
    doorBolt: 'M6',
    doorRecess: 'flush',
  });
  const res = analyze(thin);
  assert.ok(res.nErr > 0, 'Expected error when counterbore leaves < 2mm floor');
  const doorHoles = res.holes.filter((h) => h.kind === 'door');
  assert.ok(doorHoles.every((h) => h.cbDepth === 2.5));

  const thinM5 = sanitizeState({
    ...DEFAULTS,
    thick: 4,
    doorBolt: 'M5',
    doorRecess: 'flush',
  });
  const resM5 = analyze(thinM5);
  assert.equal(resM5.nErr, 1);
  assert.equal(resM5.fd.actualCbDepth, 3.5);
  const floorErr = resM5.checks.find((c) => c.lv === 'err');
  assert.ok(floorErr, 'Expected counterbore floor error');
  assert.ok(floorErr.t.includes('0,5\u00A0мм дна'), `Expected actual 0,5 mm floor in full text, got "${floorErr.t}"`);
  assert.ok(floorErr.t.includes('подрезана до 3,5'), `Expected clamp note in full text, got "${floorErr.t}"`);
  assert.equal(floorErr.short, 'Дверь: дно 0,5\u00A0мм (≥\u00A02\u00A0мм)');
});

test('outlinePts with ears expands contour beyond outer radius including slotted ears', () => {
  const withEars = sanitizeState({
    ...DEFAULTS,
    outerD: 170,
    doorBCD: 172,
    doorSlots: true,
    slotAngle: 40,
    ears: true,
    earMargin: 12,
  });
  const pts = outlinePts(withEars, 360);
  assert.ok(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  const maxR = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
  assert.ok(maxR > withEars.outerD / 2 + 2);
});

test('slotPts returns closed polyline points along arc', () => {
  const pts = slotPts(80, Math.PI / 2, (16 * Math.PI) / 180 / 2, 5.5);
  assert.ok(pts.length > 20);
});

test('buildDXF outputs valid R12 metric header and all active layers including CBORE', () => {
  const res = analyze(DEFAULTS);
  const dxf = buildDXF(DEFAULTS, res);
  assert.ok(dxf.includes('AC1009'));
  assert.ok(dxf.includes('CONTOUR'));
  assert.ok(dxf.includes('CUTOUT'));
  assert.ok(dxf.includes('DOOR'));
  assert.ok(dxf.includes('SPEAKER'));
  assert.ok(dxf.includes('CBORE'));
  assert.ok(dxf.endsWith('EOF\n'));
});

test('buildDXF excludes invalid and overlapping holes so CNC output matches valid contours', () => {
  const colliding = sanitizeState({
    ...DEFAULTS,
    doorBCD: 160,
    doorN: 4,
    doorRot: 0,
    doorRecess: 'none',
    spkBCD: 160,
    spkN: 4,
    spkRot: 0,
    spkRecess: 'none',
  });
  const res = analyze(colliding);
  const validSpk = res.holes.filter((h) => h.kind === 'spk' && h.valid).length;
  assert.equal(validSpk, 0, 'All colliding speaker holes should be marked invalid');

  const dxf = buildDXF(colliding, res);
  const entitiesSection = dxf.split('ENTITIES\n')[1] || '';
  assert.equal(entitiesSection.includes('\nSPEAKER\n'), false, 'Invalid speaker holes must not be emitted in DXF');
  const doorCircles = (entitiesSection.match(/CIRCLE\n8\nDOOR\n/g) || []).length;
  assert.equal(doorCircles, 4);
});

test('layerDesc, layerTabDesc, and buildFileBase format fastener labels consistently', () => {
  const clamped = sanitizeState({ ...DEFAULTS, thick: 3, doorBolt: 'M5', doorRecess: 'flush' });
  assert.equal(layerDesc(clamped, 'door'), '3×M5 ⌴9×2,5');
  assert.equal(layerTabDesc(clamped, 'door'), '3×M5 ⌴');
  assert.equal(layerDesc(DEFAULTS, 'spk'), '4×Ø4,2');
  assert.equal(buildFileBase(DEFAULTS), 'prostavka_D180x16_S1-168-3xM5_S2-158-4x4.2');
});

test('analyze provides concise short messages preserving numeric thresholds for inline banners', () => {
  const vazPreset = PRESETS.find((p) => p.name.includes('ВАЗ 2110'));
  assert.ok(vazPreset, 'Expected ВАЗ 2110 preset');
  const res = analyze(sanitizeState({ ...DEFAULTS, ...vazPreset.p }));
  assert.equal(res.nWarn, 1);
  const w = res.checks[0];
  assert.ok(w.short && w.short.length <= 26, `Expected concise short label, got "${w.short}"`);
  assert.ok(w.short.includes('≥\u00A03'), 'Short warning must retain minimum threshold');
});

test('fastFor, labels, and buildDXF support 90-degree countersinks for both DIN 7991 bolts and custom holes', () => {
  const s = sanitizeState({
    ...DEFAULTS,
    doorBolt: 'M5',
    doorRecess: 'csk',
    doorHeadClear: 0.5,
    spkBolt: 'custom',
    spkHoleD: 4.2,
    spkRecess: 'csk',
    spkHeadClear: 0.5,
  });

  const fd = fastFor(s, 'door');
  assert.equal(fd.active, true);
  assert.equal(fd.recessType, 'csk');
  assert.equal(fd.cbD, 10.5);
  assert.equal(fd.cbDepth, 2.5);

  const fs = fastFor(s, 'spk');
  assert.equal(fs.active, true);
  assert.equal(fs.recessType, 'csk');
  assert.equal(fs.cbD, 8.5);
  assert.equal(fs.cbDepth, 2.15);

  const deep = fastFor({ ...s, doorRecess: 'csk_deep' }, 'door');
  assert.equal(deep.cbD, 11.5);
  assert.equal(deep.cbDepth, 3);

  assert.equal(layerDesc(s, 'door'), '3×M5 ⌵10,5×90°');
  assert.equal(layerTabDesc(s, 'door'), '3×M5 ⌵');
  assert.equal(layerDesc(s, 'spk'), '4×Ø4,2 ⌵8,5×90°');
  assert.equal(layerTabDesc(s, 'spk'), '4×Ø4,2 ⌵');

  const res = analyze(s);
  assert.equal(res.nErr, 0);
  const dxf = buildDXF(s, res);
  const entities = dxf.split('ENTITIES\n')[1] || '';
  const csinkCount = (entities.match(/CIRCLE\n8\nCSINK\n/g) || []).length;
  assert.equal(csinkCount, s.doorN + s.spkN, 'Expected CSINK circles for all valid countersunk holes');
});

test('ringCenterBCD places holes midway between inner cutout and outer ring edge', () => {
  assert.equal(ringCenterBCD({ outerD: 180, innerD: 146 }), 163);
  assert.equal(ringCenterBCD({ outerD: 360, innerD: 280 }), 320);
  assert.equal(ringCenterBCD({ outerD: 232, innerD: 183 }), 208);

  const centered = sanitizeState({
    ...DEFAULTS,
    doorBCD: ringCenterBCD(DEFAULTS),
  });
  const res = analyze(centered);
  assert.equal(res.nErr, 0);
  const d = centered.doorBCD / 2;
  assert.equal(d - centered.innerD / 2, centered.outerD / 2 - d);
});

test('optimalLayerRotation evenly and symmetrically distributes holes relative to the opposite layer', () => {
  // Defaults: doorN=3 @ 90°, spkN=4 @ 45° -> already optimal & Y-symmetric
  assert.equal(isLayerRotationOptimal(DEFAULTS, 'door'), true);
  assert.equal(isLayerRotationOptimal(DEFAULTS, 'spk'), true);

  // Adding speaker holes 4 -> 6 with door 3 @ 90°: 45° is asymmetric (15° vs 45°), optimal is 0° (30° symmetric!)
  const spk6Raw = { ...DEFAULTS, spkN: 6, spkRot: 45 };
  assert.equal(isLayerRotationOptimal(spk6Raw, 'spk'), false);
  const rot6 = optimalLayerRotation(spk6Raw, 'spk');
  assert.equal(rot6 % 60, 0, `Expected 0 mod 60 for 3x6 symmetry, got ${rot6}`);
  assert.equal(isLayerRotationOptimal({ ...spk6Raw, spkRot: rot6 }, 'spk'), true);

  // Adding speaker holes 4 -> 5 with door 3 @ 90°: optimal puts speaker hole at 270° (54 mod 72), exact 12° max gap + Y-symmetry
  const rot5 = optimalLayerRotation({ ...DEFAULTS, spkN: 5 }, 'spk');
  assert.equal(rot5 % 72, 54, `Expected 54 mod 72 for 3x5 Y-symmetry, got ${rot5}`);
  assert.equal(isLayerRotationOptimal({ ...DEFAULTS, spkN: 5, spkRot: rot5 }, 'spk'), true);

  // Speaker holes 4 -> 3 with door 3 @ 90°: exact 60° hexagon (30 mod 120)
  const rot3 = optimalLayerRotation({ ...DEFAULTS, spkN: 3 }, 'spk');
  assert.equal(rot3 % 120, 30, `Expected 30 mod 120 for 3x3 hexagon, got ${rot3}`);

  // 4 door @ 0° with 8 speaker holes: exact 22.5° stagger avoids collision and maximizes clearance
  const rot8 = optimalLayerRotation({ ...DEFAULTS, doorN: 4, doorRot: 0, spkN: 8, spkRot: 45 }, 'spk');
  assert.equal(rot8 % 45, 22.5, `Expected 22.5 mod 45 for 4x8 stagger, got ${rot8}`);
  assert.equal(analyze(sanitizeState({ ...DEFAULTS, doorN: 4, doorRot: 0, spkN: 8, spkRot: rot8 })).nErr, 0);

  // 6 door holes with 4 speaker @ 45°: 30 mod 60 gives 15° symmetric clearance
  const rotDoor6 = optimalLayerRotation({ ...DEFAULTS, doorN: 6 }, 'door');
  assert.equal(rotDoor6 % 60, 30, `Expected 30 mod 60 for 6x4 symmetry, got ${rotDoor6}`);
});

test('doorAutoSpace eliminates tight cross-layer crowding without bunching ears and preserves exact Y-symmetry', () => {
  const minSameGap = (angles: number[]) => {
    const s = [...angles].sort((a, b) => a - b);
    let best = 360;
    for (let i = 0; i < s.length; i++) {
      const g = (s[(i + 1) % s.length] - s[i] + 360) % 360 || 360;
      if (g < best) best = g;
    }
    return best;
  };
  const ySymErr = (angles: number[]) => {
    const sorted = [...angles].sort((a, b) => a - b);
    const mirrored = angles.map((a) => (((180 - a) % 360) + 360) % 360).sort((a, b) => a - b);
    let err = 0;
    for (let i = 0; i < sorted.length; i++) {
      const d = Math.abs(sorted[i] - mirrored[i]);
      err = Math.max(err, Math.min(d, 360 - d));
    }
    return err;
  };

  // 5 door vs 4 speaker: rigid 72° pentagon squeezes two pairs to 9°, whereas doorAutoSpace balances to >=15° without bunching ears
  const rigid5x4 = sanitizeState({ ...DEFAULTS, doorN: 5, doorRot: 90, doorAutoSpace: false });
  assert.equal(areLayerCountsCompatible(5, 4), false);
  assert.equal(isDoorAutoShifted(rigid5x4), false);
  assert.equal(minActualCrossLayerGapDeg(rigid5x4), 9);

  const auto5x4 = sanitizeState({ ...DEFAULTS, doorN: 5, doorRot: 90, doorAutoSpace: true });
  assert.equal(isDoorAutoShifted(auto5x4), true);
  assert.ok(
    minActualCrossLayerGapDeg(auto5x4) >= 15,
    `Expected >=15° clearance on 5x4, got ${minActualCrossLayerGapDeg(auto5x4)}`
  );
  const angles5x4 = layerHoleAnglesDeg(auto5x4, 'door');
  assert.ok(minSameGap(angles5x4) >= 56, `Expected no bunched ears on 5x4 (>=56°), got ${minSameGap(angles5x4)}`);
  assert.ok(ySymErr(angles5x4) <= 0.5, 'Expected left-right Y symmetry for 5x4');
  const an5x4 = analyze(auto5x4);
  assert.equal(an5x4.nErr, 0);
  assert.equal(an5x4.nWarn, 0);

  // 6 door vs 5 speaker (regression for user screenshot: must NOT tilt spk to 48° or crush bottom ears to 34°!)
  const pair6x5 = optimalLayerPairRotations(
    { ...DEFAULTS, doorN: 6, doorRot: 90, spkN: 5, spkRot: 45, doorAutoSpace: true },
    'spk'
  );
  assert.equal(pair6x5.spkRot % 72, 54, `Expected Y-symmetric 54 mod 72 for 6x5 spkRot, got ${pair6x5.spkRot}`);
  const st6x5 = sanitizeState({
    ...DEFAULTS,
    doorN: 6,
    spkN: 5,
    spkBCD: 166,
    doorRot: pair6x5.doorRot,
    spkRot: pair6x5.spkRot,
    doorAutoSpace: true,
  });
  const door6x5 = layerHoleAnglesDeg(st6x5, 'door');
  const spk6x5 = layerHoleAnglesDeg(st6x5, 'spk');
  assert.ok(ySymErr(door6x5) <= 0.5, `Expected Y-symmetric door ears on 6x5, err=${ySymErr(door6x5)}`);
  assert.ok(ySymErr(spk6x5) <= 0.5, `Expected Y-symmetric speaker holes on 6x5, err=${ySymErr(spk6x5)}`);
  assert.ok(minSameGap(door6x5) >= 46, `Expected no bunched twin ears on 6x5 (>=46°), got ${minSameGap(door6x5)}`);
  assert.ok(
    minActualCrossLayerGapDeg(st6x5) >= 12,
    `Expected >=12° clearance on 6x5, got ${minActualCrossLayerGapDeg(st6x5)}`
  );
  assert.equal(analyze(st6x5).nErr, 0);

  // Speaker holes always remain strict regular 360°/N regardless of doorAutoSpace
  const spkAngles = layerHoleAnglesDeg(auto5x4, 'spk');
  assert.deepEqual(spkAngles, [45, 135, 225, 315]);

  // Compatible pairs (4x4, 8x4) stay exact regular polygons even with doorAutoSpace: true
  const auto8x4 = sanitizeState({ ...DEFAULTS, doorN: 8, doorRot: 67.5, doorAutoSpace: true });
  assert.equal(areLayerCountsCompatible(8, 4), true);
  assert.equal(isDoorAutoShifted(auto8x4), false);
  assert.equal(minActualCrossLayerGapDeg(auto8x4), 22.5);

  // Stress test tough incompatible pairs (7x4, 5x6, 7x8): all preserve >=74% regular pitch, Y-symmetry, and 0 errors
  for (const [dN, sN] of [
    [7, 4],
    [5, 6],
    [7, 8],
  ] as const) {
    const pair = optimalLayerPairRotations({ ...DEFAULTS, doorN: dN, spkN: sN, doorAutoSpace: true }, 'spk');
    const finalSt = sanitizeState({
      ...DEFAULTS,
      doorN: dN,
      spkN: sN,
      doorRot: pair.doorRot,
      spkRot: pair.spkRot,
      doorAutoSpace: true,
    });
    const dAng = layerHoleAnglesDeg(finalSt, 'door');
    assert.ok(
      minActualCrossLayerGapDeg(finalSt) >= 9,
      `Expected >=9° clearance for ${dN}x${sN}, got ${minActualCrossLayerGapDeg(finalSt)}`
    );
    assert.ok(minSameGap(dAng) >= (360 / dN) * 0.74, `Expected >=74% pitch on ${dN}x${sN}, got ${minSameGap(dAng)}`);
    assert.ok(ySymErr(dAng) <= 0.5, `Expected Y-symmetry on ${dN}x${sN}, err=${ySymErr(dAng)}`);
    assert.equal(analyze(finalSt).nErr, 0, `Expected 0 errors for ${dN}x${sN}`);
  }
});
