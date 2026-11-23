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

const languages = [
  {
    locale: 'ru-RU',
    lang: 'ru',
    size: /20 см/,
    next: 'Далее',
    export: 'Экспорт',
    stl: /STL \(мм\)/,
    drawing: 'Чертёж 1:1',
    model: '3D-модель',
    diameter: 'Внешний диаметр, число',
    thickness: 'Толщина проставки, число',
    drawingStamp: 'ПРОСТАВКА',
    decimal: '16,5',
  },
  {
    locale: 'en-US',
    lang: 'en',
    size: /20 cm/,
    next: 'Next',
    export: 'Export',
    stl: /STL \(mm\)/,
    drawing: '1:1 drawing',
    model: '3D model',
    diameter: 'Outer diameter, numeric value',
    thickness: 'Spacer thickness, numeric value',
    drawingStamp: 'SPACER',
    decimal: '16.5',
  },
];

for (const language of languages) {
  test.describe(language.locale, () => {
    test.use({ locale: language.locale });

    test('wizard to export', async ({ page }) => {
      await page.goto('/?mode=wizard');
      await expect(page.locator('html')).toHaveAttribute('lang', language.lang);
      await page.getByRole('button', { name: language.size }).click();
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: language.next, exact: true }).click();
      }
      await page.getByRole('banner').getByRole('button', { name: language.export }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      const dxf = await download(page, /DXF R12/);
      expect(dxf.name).toMatch(/\.dxf$/);
      const dxfText = dxf.data.toString('utf8');
      expect(dxfText).toContain('AC1009');
      expect(dxfText.endsWith('EOF\n')).toBe(true);

      const stl = await download(page, language.stl);
      expect(stl.name).toMatch(/\.stl$/);
      expect(stl.data.length).toBeGreaterThan(84);
      expect(stl.data.length).toBe(84 + 50 * stl.data.readUInt32LE(80));

      const svg = await download(page, /SVG 1:1/);
      expect(svg.name).toMatch(/\.svg$/);
      const svgText = svg.data.toString('utf8');
      expect(svgText.startsWith('<?xml')).toBe(true);
      expect(svgText).toMatch(/width="[\d.]+mm"/);
      expect(svgText).toContain('RingCraft');
      expect(svgText).toContain(language.drawingStamp);
    });

    test('2d and 3d views switch', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto('/?mode=edit');
      await page.getByRole('tab', { name: language.drawing }).click();
      await expect(page.getByTestId('viewport-2d-svg')).toBeVisible();
      await page.getByRole('tab', { name: language.model }).click();
      await expect(page.getByTestId('viewport-3d-canvas').locator('canvas')).toBeVisible();

      expect(errors).toEqual([]);
    });

    test('restores after reload', async ({ page }) => {
      await page.goto('/?mode=edit');
      const field = page.getByRole('textbox', { name: language.diameter });
      await field.fill('175');
      await field.press('Enter');
      await expect(field).toHaveValue('175');
      const thickness = page.getByRole('textbox', { name: language.thickness });
      await thickness.fill('16.5');
      await thickness.press('Enter');
      await expect(thickness).toHaveValue(language.decimal);

      // State is persisted to localStorage with a short debounce; wait for it before reloading.
      await expect.poll(() => page.evaluate(() => window.localStorage.getItem('ringforge.state'))).toContain('175');

      await page.reload();
      await expect(field).toHaveValue('175');
      await expect(thickness).toHaveValue(language.decimal);
    });
  });
}

test('desktop fills the window and mobile keeps its gutters', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/');
  const workspace = page.getByRole('main');
  const canvas = page.getByTestId('viewport-3d-canvas');
  const panel = workspace.getByRole('complementary');
  await expect(workspace).toBeVisible();
  expect(await workspace.boundingBox()).toMatchObject({ x: 0, width: 2560 });
  expect(await canvas.boundingBox()).toMatchObject({ x: 25, width: 2094 });
  expect(await panel.boundingBox()).toMatchObject({ x: 2132, width: 404 });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await workspace.boundingBox()).toMatchObject({ x: 0, width: 390 });
  expect(await panel.boundingBox()).toMatchObject({ x: 10, width: 370 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('an unsupported browser locale falls back to English', async ({ browser }) => {
  const page = await browser.newPage({ locale: 'fr-FR' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Setup wizard' })).toBeVisible();
  await page.close();
});
