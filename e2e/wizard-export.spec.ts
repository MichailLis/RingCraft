import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function download(page: Page, buttonName: RegExp) {
  const dialog = page.getByRole('dialog');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: buttonName }).click(),
  ]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), data: await readFile(path) };
}

test('wizard to export', async ({ page }) => {
  await page.goto('/?mode=wizard');
  await page.getByRole('button', { name: /20 см/ }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
  }
  await page.getByRole('banner').getByRole('button', { name: 'Экспорт' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const dxf = await download(page, /DXF R12/);
  expect(dxf.name).toMatch(/\.dxf$/);
  const dxfText = dxf.data.toString('utf8');
  expect(dxfText).toContain('AC1009');
  expect(dxfText.endsWith('EOF\n')).toBe(true);

  const stl = await download(page, /STL \(мм\)/);
  expect(stl.name).toMatch(/\.stl$/);
  expect(stl.data.length).toBeGreaterThan(84);
  expect(stl.data.length).toBe(84 + 50 * stl.data.readUInt32LE(80));

  const svg = await download(page, /SVG 1:1/);
  expect(svg.name).toMatch(/\.svg$/);
  const svgText = svg.data.toString('utf8');
  expect(svgText.startsWith('<?xml')).toBe(true);
  expect(svgText).toMatch(/width="[\d.]+mm"/);
  expect(svgText).toContain('RingCraft');
});

test('2d and 3d views switch', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?mode=edit');
  await page.getByRole('tab', { name: 'Чертёж 1:1' }).click();
  await expect(page.getByTestId('viewport-2d-svg')).toBeVisible();
  await page.getByRole('tab', { name: '3D-модель' }).click();
  await expect(page.getByTestId('viewport-3d-canvas')).toBeVisible();

  expect(errors).toEqual([]);
});

test('restores after reload', async ({ page }) => {
  await page.goto('/?mode=edit');
  const field = page.getByRole('textbox', { name: 'Внешний диаметр, число' });
  await field.fill('175');
  await field.press('Enter');
  await expect(field).toHaveValue('175');

  // State is persisted to localStorage with a short debounce; wait for it before reloading.
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('ringforge.state'))).toContain('175');

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Внешний диаметр, число' })).toHaveValue('175');
});
