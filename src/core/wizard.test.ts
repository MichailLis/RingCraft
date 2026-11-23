import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from './constants';
import { analyze, sanitizeState } from './geometry';
import {
  QUICK_SIZES,
  WIZARD_STEPS,
  clampWizardStep,
  detectQuickSizeId,
  nextWizardStep,
  prevWizardStep,
  resolveInitialPanelMode,
  wizardStepForLayer,
} from './wizard';

test('wizard step navigation clamps bounds and signals completion on final step', () => {
  assert.equal(WIZARD_STEPS.length, 4);
  assert.equal(WIZARD_STEPS[3].id, 'export');
  assert.equal(WIZARD_STEPS[3].shortLabel, 'Экспорт');
  assert.equal(clampWizardStep(-5), 0);
  assert.equal(clampWizardStep(99), 3);
  assert.equal(clampWizardStep(Number.NaN), 0);

  assert.deepEqual(nextWizardStep(0), { done: false, step: 1 });
  assert.deepEqual(nextWizardStep(2), { done: false, step: 3 });
  assert.deepEqual(nextWizardStep(3), { done: true, step: 3 });

  assert.equal(prevWizardStep(0), 0);
  assert.equal(prevWizardStep(2), 1);
});

test('wizardStepForLayer maps door and speaker layers to matching wizard steps', () => {
  assert.equal(WIZARD_STEPS[wizardStepForLayer('door')].id, 'door');
  assert.equal(WIZARD_STEPS[wizardStepForLayer('spk')].id, 'spk');
});

test('resolveInitialPanelMode defaults to wizard on fresh entry and honors saved or query overrides', () => {
  assert.equal(resolveInitialPanelMode(undefined, ''), 'wizard');
  assert.equal(resolveInitialPanelMode('edit', ''), 'edit');
  assert.equal(resolveInitialPanelMode('wizard', ''), 'wizard');
  assert.equal(resolveInitialPanelMode('wizard', '?autostart=1'), 'edit');
  assert.equal(resolveInitialPanelMode('wizard', '?mode=edit'), 'edit');
  assert.equal(resolveInitialPanelMode('edit', '?mode=wizard'), 'wizard');
});

test('all wizard quick-size templates produce valid error-free and warning-free geometry and match detection', () => {
  for (const q of QUICK_SIZES) {
    const s = sanitizeState({ ...DEFAULTS, ...q.patch });
    const a = analyze(s);
    assert.equal(a.nErr, 0, `Quick size ${q.label} produced geometry errors`);
    assert.equal(
      a.nWarn,
      0,
      `Quick size ${q.label} produced geometry warnings: ${a.checks.map((c) => c.t).join('; ')}`
    );
    assert.equal(detectQuickSizeId(s), q.id);
  }
  assert.equal(detectQuickSizeId({ outerD: 195, innerD: 155 }), null);
});
