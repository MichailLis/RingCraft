import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS, QUALITY_PARAMS } from './constants';
import { analyze, sanitizeState } from './geometry';
import { buildSpacerSolid } from './solidMesh';
import { buildSpacerSTL } from './stlExport';

async function stlFor(s: ReturnType<typeof sanitizeState>) {
  return buildSpacerSTL(s, analyze(s));
}

test('binary stl layout is consistent', async () => {
  const s = sanitizeState({ ...DEFAULTS });
  const dv = await stlFor(s);
  const n = dv.getUint32(80, true);
  assert.ok(n > 0);
  assert.equal(dv.byteLength, 84 + 50 * n);
});

test('stl matches solid for all presets', async () => {
  for (const preset of PRESETS) {
    const s = sanitizeState({ ...DEFAULTS, ...preset.p });
    const a = analyze(s);
    const q = QUALITY_PARAMS[s.quality] ?? QUALITY_PARAMS.std;
    const { geometry } = buildSpacerSolid(s, a, q.seg, q.out, true, false);
    const expected = geometry.attributes.position.count / 3;
    geometry.dispose();
    const dv = await buildSpacerSTL(s, a);
    assert.equal(dv.getUint32(80, true), expected, preset.name ?? 'preset');
  }
});

test('stl normals are finite', async () => {
  const dv = await stlFor(sanitizeState({ ...DEFAULTS }));
  const n = dv.getUint32(80, true);
  for (let i = 0; i < n; i++) {
    const o = 84 + 50 * i;
    for (let k = 0; k < 3; k++) assert.ok(Number.isFinite(dv.getFloat32(o + 4 * k, true)));
  }
});

test('stl builds without DOM', async () => {
  assert.equal(typeof document, 'undefined');
  await assert.doesNotReject(stlFor(sanitizeState({ ...DEFAULTS })));
});
