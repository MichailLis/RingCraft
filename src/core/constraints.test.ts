import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS, isOutsideStdRange } from './constants';
import { applyConstrainedPatch, applyRingResizeWithAutoFit } from './constraints';
import { analyze, sanitizeState } from './geometry';
import { QUICK_SIZES } from './wizard';

test('thick clamps at minimum valid floor thickness for active counterbore and explains why', () => {
  // Default has doorBolt M5 flush (cbDepth = 5 mm -> requires thick >= 7 mm)
  const res = applyConstrainedPatch(DEFAULTS, { thick: 4 }, 'thick');
  assert.equal(res.clamped, true);
  assert.equal(res.state.thick, 7);
  assert.equal(analyze(res.state).nErr, 0);
  assert.ok(res.notice, 'Expected explanation notice');
  assert.equal(res.notice.field, 'thick');
  assert.equal(res.notice.blockingLayer, 'door');
  assert.ok(res.notice.reason.includes('7'), `Expected limit 7 in reason: "${res.notice.reason}"`);
  assert.ok(res.notice.reason.includes('M5'), `Expected M5 bolt in reason: "${res.notice.reason}"`);
});

test('outerD clamps before speaker holes exit the ring contour and identifies Layer 2', () => {
  // Default spkBCD = 158, holeD = 4.2 -> min outerD where d + r + 0.35 <= R is 163 mm
  const res = applyConstrainedPatch(DEFAULTS, { outerD: 140 }, 'outerD');
  assert.equal(res.clamped, true);
  assert.equal(res.state.outerD, 163);
  assert.equal(analyze(res.state).nErr, 0);
  assert.ok(res.notice);
  assert.equal(res.notice.field, 'outerD');
  assert.equal(res.notice.blockingLayer, 'spk');
  assert.ok(res.notice.reason.includes('163'), `Expected 163 in reason: "${res.notice.reason}"`);
  assert.ok(res.notice.reason.includes('динамика'), `Expected speaker fastener mention: "${res.notice.reason}"`);
});

test('innerD clamps before hitting speaker holes and explains why', () => {
  // Default spkBCD = 158, holeD = 4.2 -> max innerD is 153 mm
  const res = applyConstrainedPatch(DEFAULTS, { innerD: 170 }, 'innerD');
  assert.equal(res.clamped, true);
  assert.equal(res.state.innerD, 153);
  assert.equal(analyze(res.state).nErr, 0);
  assert.ok(res.notice);
  assert.equal(res.notice.field, 'innerD');
  assert.equal(res.notice.blockingLayer, 'spk');
  assert.ok(res.notice.reason.includes('153'), `Expected 153 in reason: "${res.notice.reason}"`);
});

test('spkBCD clamps cleanly at both inner cutout and outer contour limits', () => {
  const tooSmall = applyConstrainedPatch(DEFAULTS, { spkBCD: 130 }, 'spkBCD');
  assert.equal(tooSmall.clamped, true);
  assert.equal(analyze(tooSmall.state).nErr, 0);
  assert.ok(tooSmall.state.spkBCD >= 151);
  assert.ok(tooSmall.notice?.reason.includes('вырез'));

  const tooBig = applyConstrainedPatch(DEFAULTS, { spkBCD: 210 }, 'spkBCD');
  assert.equal(tooBig.clamped, true);
  assert.equal(analyze(tooBig.state).nErr, 0);
  assert.ok(tooBig.state.spkBCD <= 176);
  assert.ok(tooBig.notice?.reason.includes('контур'));
});

test('cross-layer overlap stops rotation before colliding with the other layer', () => {
  // Put both layers on same BCD = 160 so spkRot = 0 collides with doorRot = 0
  const base = sanitizeState({
    ...DEFAULTS,
    doorBCD: 160,
    doorN: 4,
    doorRot: 0,
    doorRecess: 'none',
    spkBCD: 160,
    spkN: 4,
    spkRot: 45,
    spkRecess: 'none',
  });
  assert.equal(analyze(base).nErr, 0);

  const res = applyConstrainedPatch(base, { spkRot: 0 }, 'spkRot');
  assert.equal(res.clamped, true);
  assert.equal(analyze(res.state).nErr, 0);
  assert.ok(res.state.spkRot > 0 && res.state.spkRot < 45);
  assert.ok(res.notice);
  assert.equal(res.notice.blockingLayer, 'door');
  assert.ok(res.notice.reason.includes('пересечение'));
});

test('turning off mounting ears is blocked when Layer 1 holes rely on ears', () => {
  const base = sanitizeState({
    ...DEFAULTS,
    outerD: 180,
    doorBCD: 176,
    ears: true,
    earMargin: 6,
  });
  assert.equal(analyze(base).nErr, 0);

  const res = applyConstrainedPatch(base, { ears: false }, 'ears');
  assert.equal(res.applied, false);
  assert.equal(res.clamped, true);
  assert.equal(res.state.ears, true);
  assert.ok(res.notice?.reason.includes('ушки'));
});

test('selecting a bolt too deep for current thickness is blocked with exact required thickness', () => {
  const thin = sanitizeState({
    ...DEFAULTS,
    thick: 8,
    doorBolt: 'M5',
    doorRecess: 'flush',
  });
  assert.equal(analyze(thin).nErr, 0);

  const res = applyConstrainedPatch(thin, { doorBolt: 'M8', doorHoleD: 9 }, 'doorBolt');
  assert.equal(res.applied, false);
  assert.equal(res.clamped, true);
  assert.equal(res.state.doorBolt, 'M5');
  assert.ok(res.notice?.reason.includes('10'));
  assert.ok(res.notice?.reason.includes('M8'));
});

test('all quick-sizes and presets apply atomically without constraint notices', () => {
  for (const q of QUICK_SIZES) {
    const res = applyConstrainedPatch(DEFAULTS, q.patch);
    assert.equal(res.clamped, false, `Quick size ${q.label} must apply cleanly`);
    assert.equal(res.notice, null);
    assert.equal(analyze(res.state).nErr, 0);
  }
  for (const p of PRESETS) {
    const res = applyConstrainedPatch(DEFAULTS, { ...DEFAULTS, ...p.p });
    assert.equal(res.clamped, false, `Preset ${p.name} must apply cleanly`);
    assert.equal(res.notice, null);
    assert.equal(analyze(res.state).nErr, 0);
  }
});

test('recovery rule allows edits that reduce errors on a legacy broken state', () => {
  const broken = sanitizeState({
    ...DEFAULTS,
    thick: 4,
    doorBolt: 'M5',
    doorRecess: 'flush',
  });
  assert.equal(analyze(broken).nErr, 1);

  const fixed = applyConstrainedPatch(broken, { thick: 8 }, 'thick');
  assert.equal(fixed.applied, true);
  assert.equal(fixed.clamped, false);
  assert.equal(fixed.state.thick, 8);
  assert.equal(analyze(fixed.state).nErr, 0);
});

test('countersink floor constraint clamps thickness and explains зенковка 90°', () => {
  // M8 DIN 7991 csk with 0.5 clear -> cbD = 16.5, holeD = 9 -> cbDepth = 3.75 mm -> min thick = 6 mm
  const base = sanitizeState({
    ...DEFAULTS,
    thick: 14,
    doorBolt: 'M8',
    doorRecess: 'csk',
    doorHeadClear: 0.5,
    earMargin: 8,
  });
  assert.equal(analyze(base).nErr, 0);

  const res = applyConstrainedPatch(base, { thick: 4 }, 'thick');
  assert.equal(res.clamped, true);
  assert.equal(res.state.thick, 6);
  assert.equal(analyze(res.state).nErr, 0);
  assert.ok(res.notice?.reason.includes('зенковка 90°'), `Expected зенковка 90° in "${res.notice?.reason}"`);
  assert.ok(res.notice?.reason.includes('6'));
  assert.equal(res.notice?.canAutoFitHoles, true);
  assert.deepEqual(res.notice?.attemptedPatch, { thick: 4 });
});

test('applyRingResizeWithAutoFit smoothly resizes Step 1 up to 12-inch sub and down to tiny tweeter without hole blocking', () => {
  // Scale UP: 180/146 -> 360/280 thick 42 (12" sub spacer)
  const up1 = applyRingResizeWithAutoFit(DEFAULTS, { outerD: 360 }, 'outerD', true);
  assert.equal(up1.clamped, false);
  assert.equal(up1.state.outerD, 360);
  assert.equal(analyze(up1.state).nErr, 0);

  const up2 = applyRingResizeWithAutoFit(up1.state, { innerD: 280 }, 'innerD', true);
  assert.equal(up2.clamped, false);
  assert.equal(up2.state.innerD, 280);
  assert.equal(analyze(up2.state).nErr, 0);
  assert.ok(up2.state.doorBCD > 280 && up2.state.doorBCD < 360);
  assert.ok(up2.state.spkBCD > 280 && up2.state.spkBCD < 360);
  assert.equal(isOutsideStdRange(up2.state), true);

  const up3 = applyRingResizeWithAutoFit(up2.state, { thick: 42 }, 'thick', true);
  assert.equal(up3.clamped, false);
  assert.equal(up3.state.thick, 42);
  assert.equal(analyze(up3.state).nErr, 0);

  // Scale DOWN: 180/146 -> 78/52 thick 4 (compact tweeter/midrange ring)
  const dn1 = applyRingResizeWithAutoFit(DEFAULTS, { innerD: 52 }, 'innerD', true);
  assert.equal(dn1.clamped, false);
  assert.equal(dn1.state.innerD, 52);
  assert.equal(analyze(dn1.state).nErr, 0);

  const dn2 = applyRingResizeWithAutoFit(dn1.state, { outerD: 78 }, 'outerD', true);
  assert.equal(dn2.clamped, false);
  assert.equal(dn2.state.outerD, 78);
  assert.equal(analyze(dn2.state).nErr, 0);
  assert.ok(dn2.state.doorBCD > 52 && dn2.state.doorBCD < 78);
  assert.ok(dn2.state.spkBCD > 52 && dn2.state.spkBCD < 78);

  const dn3 = applyRingResizeWithAutoFit(dn2.state, { thick: 4 }, 'thick', true);
  assert.equal(dn3.clamped, false);
  assert.equal(dn3.state.thick, 4);
  assert.equal(dn3.state.doorRecess, 'none');
  assert.equal(analyze(dn3.state).nErr, 0);

  // Still prevents outerD from collapsing into innerD
  const tooClose = applyRingResizeWithAutoFit(DEFAULTS, { outerD: 120 }, 'outerD', true);
  assert.equal(tooClose.clamped, true);
  assert.equal(tooClose.state.outerD, 158); // innerD 146 + MIN_RING_DIFF 12
  assert.equal(analyze(tooClose.state).nErr, 0);
  assert.ok(tooClose.notice?.reason.includes('158'));
});
