import test from 'node:test';
import assert from 'node:assert/strict';
import { applyExportFrame, DRAWING_MARGIN_MM, exportFrame } from './svgExport';

test('export frame is square around the part', () => {
  // The signature takes only maxR, so the frame cannot depend on the current zoom.
  assert.equal(DRAWING_MARGIN_MM, 54);
  assert.deepEqual(exportFrame(100), { x: -154, y: -154, w: 308, h: 308 });
  assert.deepEqual(exportFrame(100), { x: -154, y: -154, w: 308, h: 308 });
});

test('units are millimetres', () => {
  const attrs = new Map<string, string>();
  const fake = { setAttribute: (k: string, v: string) => void attrs.set(k, v) } as unknown as SVGSVGElement;
  applyExportFrame(fake, { x: -10, y: -10, w: 20, h: 20 });
  assert.equal(attrs.get('width'), '20mm');
  assert.equal(attrs.get('height'), '20mm');
  assert.equal(attrs.get('viewBox'), '-10 -10 20 20');
});
