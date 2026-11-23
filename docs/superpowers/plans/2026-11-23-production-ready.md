# RingCraft: доведение до продакшна — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Выложить RingCraft на Vercel как публичный сайт: порядок в репозитории, устойчивость к сбоям, корректный экспорт, CI и автодеплой.

**Architecture:** Статическое SPA на Vite без бэкенда. Чистая логика живёт в `src/core/` и покрывается тестами `node:test`, которые запускает `bun test`. UI на React в `src/components/`. Новая логика (хранилище, STL, рамка SVG) идёт в `core`, компоненты только вызывают её. Деплой через Vercel Git Integration, проверки в GitHub Actions.

**Tech Stack:** React 19, three.js 0.187, Vite 8, Tailwind 4, TypeScript 7, bun 1.3, ESLint 9 (flat) + typescript-eslint + eslint-plugin-react-hooks, Prettier, Playwright, @fontsource, @vercel/analytics.

**Spec:** `docs/superpowers/specs/2026-11-23-production-ready-design.md`

## Global Constraints

- Название везде — **RingCraft**. Ключи `localStorage` `ringforge.state`, `ringforge.ui`, `ringforge.saved` **не переименовываются**.
- Лицензия — MIT, правообладатель — владелец репозитория (MichailLis), год 2026.
- Для тех же параметров геометрия STL и содержимое DXF не меняются. SVG меняется намеренно (Task 6).
- Пакетный менеджер — bun. `bun.lock` коммитится вместе с изменениями зависимостей.
- Со сторонних доменов сайт ничего не загружает (аналитика Vercel идёт с того же домена, `/_vercel/insights/*`).
- Работа ведётся в ветке `prod-ready`. Пуш и PR — только с разрешения владельца. PR по блокам: A = Tasks 1–2, B = 3–7, C = 8–9, D = 10.
- Перед каждым коммитом проходят `bun run typecheck`, `bun test` и (после Task 2) `bun run lint`.

## Review Focus

1. **Сохранения пользователей текущей версии**, записанные без поля `v`, должны загрузиться после обновления. Закреплено в Task 3, тест `legacy unversioned value is migrated`.
2. **Повреждённый JSON и переполненное хранилище** (`setItem` бросает `QuotaExceededError`): приложение не падает, используются значения по умолчанию. Task 3, тесты `corrupt json falls back` и `write swallows quota errors`.
3. **Нет WebGL** (старый ноутбук, отключённое ускорение): STL всё равно скачивается. Task 5: STL строится в `core` без рендерера, тест гоняет его в Node без DOM.
4. **SVG экспортируется, когда чертёж приближен или сдвинут**: в файле весь чертёж в масштабе 1:1 в мм. Task 6, тест `export frame does not depend on current zoom`.
5. **STL не изменился после выноса в core**: число треугольников и объём совпадают с `buildSpacerSolid` для всех пресетов. Task 5, тест `stl matches solid for all presets`.

---

## Блок A — порядок в репозитории

### Task 1: Ребрендинг в RingCraft, удаление хвостов AI Studio, скрипты, strict

**Files:**
- Modify: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/components/HeaderBar.tsx:37`, `src/components/Viewport2D.tsx:311`, `.gitignore`
- Delete: `metadata.json`, `.env.example`, `public/assets/aistudio/` (вся папка)
- Create: `LICENSE`

- [ ] **Step 1:** `git checkout -b prod-ready`.
- [ ] **Step 2:** `package.json`: `"name": "ringcraft"`, `"version": "1.0.0"`, `"license": "MIT"`. Скрипты: `"test": "bun test src"`, `"typecheck": "tsc --noEmit"`; `lint` пока оставить как `tsc --noEmit` (Task 2 заменит). Удалить `clean`. `@types/three`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite` перенести в `devDependencies`.
- [ ] **Step 3:** Во всех местах заменить `RINGFORGE` на `RingCraft`: `<title>`, `meta description`, `og:title` в `index.html`; логотип в `HeaderBar.tsx:37` (выводить `RingCraft`, регистр шрифта оставить на CSS); штамп чертежа `Viewport2D.tsx:311` → `'RingCraft · масштаб 1:1 · мм'`. Ключи `ringforge.*` в `App.tsx:52-54` не трогать, рядом комментарий: `// legacy prefix kept: renaming would drop users' saved data`.
- [ ] **Step 4:** `vite.config.ts`: удалить плагин `copy-unbundled-src-assets` и блок `server` с `DISABLE_HMR` (оставить vite по умолчанию). Удалить `metadata.json`, `.env.example`, `public/assets/aistudio/`. Из `.gitignore` убрать `!.env.example`, добавить `playwright-report/`, `test-results/`, `.vercel`.
- [ ] **Step 5:** `tsconfig.json`: добавить `"strict": true`, удалить `experimentalDecorators`, `useDefineForClassFields`, `allowJs`.
- [ ] **Step 6:** Создать `LICENSE` со стандартным текстом MIT, `Copyright (c) 2026 MichailLis`.
- [ ] **Step 7: Проверка.** `bun run typecheck && bun test && bun run build`. Ожидается: 0 ошибок, 35 pass, сборка успешна. `bun run dev`: в шапке и вкладке браузера RingCraft, на чертеже штамп «RingCraft · масштаб 1:1 · мм».
- [ ] **Step 8: Commit** `chore: rebrand to RingCraft, drop AI Studio leftovers, enable strict TS` (включая изменённый `bun.lock`).

### Task 2: ESLint + Prettier

**Files:**
- Create: `eslint.config.js`, `.prettierrc.json`, `.prettierignore`
- Modify: `package.json`, файлы с замечаниями линтера

- [ ] **Step 1:** `bun add -d eslint @eslint/js typescript-eslint eslint-plugin-react-hooks prettier`.
- [ ] **Step 2:** `eslint.config.js` (flat): `js.configs.recommended`, `tseslint.configs.recommended`, `reactHooks.configs['recommended-latest']`; ignores `dist`, `playwright-report`, `test-results`. `.prettierrc.json`: `{"singleQuote": true, "printWidth": 120, "trailingComma": "es5"}` (так уже отформатирован код). `.prettierignore`: `dist`, `bun.lock`, `docs`.
- [ ] **Step 3:** Скрипты: `"lint": "eslint ."`, `"format": "prettier --write ."`, `"format:check": "prettier --check ."`.
- [ ] **Step 4:** `bun run lint`, исправить найденное. Правила `react-hooks/exhaustive-deps` не отключать глобально: точечный `eslint-disable-next-line` с причиной допустим только там, где зависимость намеренно стабильна через ref. Затем `bun run format`.
- [ ] **Step 5: Проверка.** `bun run lint && bun run format:check && bun run typecheck && bun test`: всё чисто, 35 pass.
- [ ] **Step 6: Commit** `chore: add ESLint and Prettier, fix lint findings`. Форматирование оформить отдельным коммитом `style: prettier`, чтобы диф логики читался.

## Блок B — надёжность

### Task 3: Версионированное хранилище

**Files:**
- Create: `src/core/storage.ts`, `src/core/storage.test.ts`
- Modify: `src/App.tsx:52-122` (`loadInitialState`, `loadInitialUI`, `loadSavedPresets`) и эффекты записи (`App.tsx:~195-220`)

**Interfaces:**
- Produces:
  - `type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`
  - `const STORAGE_VERSION = 1`
  - `readStored<T>(kv: KV, key: string, parse: (data: unknown) => T, fallback: T): T`: читает `{ v, data }`. Если значение валидный JSON без числового `v` на верхнем уровне, это legacy-данные (версия 0): `data = весь объект`. Затем `parse(data)`. Любое исключение (JSON, `parse`, `getItem`) возвращает `fallback`. Если `v > STORAGE_VERSION` (данные из будущей версии), тоже `fallback`.
  - `writeStored(kv: KV, key: string, data: unknown): void` пишет `JSON.stringify({ v: STORAGE_VERSION, data })` и глотает исключения.
  - `clearStored(kv: KV, keys: string[]): void` (для кнопки сброса в Task 4).
  - `const STORAGE_KEYS = { state: 'ringforge.state', ui: 'ringforge.ui', saved: 'ringforge.saved' } as const`

- [ ] **Step 1: Тесты** (`storage.test.ts`, фейковый `KV` на `Map`):
  - `missing key returns fallback`
  - `round trip`: `writeStored(kv,'k',{a:1})`, затем `readStored(kv,'k',x=>x,null)` даёт `{a:1}`, а сырое значение — `{"v":1,"data":{"a":1}}`.
  - `legacy unversioned value is migrated`: сырое `'{"outerD":200}'` с `parse = d => sanitizeState(d)` даёт `outerD === 200`. Сырое `'[{"name":"x","p":{}}]'` (массив пресетов) возвращается как массив.
  - `corrupt json falls back`: `'{oops'` даёт fallback.
  - `parse that throws falls back`.
  - `future version falls back`: `'{"v":99,"data":{}}'` даёт fallback.
  - `write swallows quota errors`: `setItem` бросает `DOMException('quota','QuotaExceededError')`, `writeStored` не бросает.
- [ ] **Step 2:** `bun test src/core/storage.test.ts`: FAIL (модуля нет).
- [ ] **Step 3:** Реализовать `storage.ts` по сигнатурам выше.
- [ ] **Step 4:** `bun test src/core/storage.test.ts`: PASS.
- [ ] **Step 5:** Перевести три загрузчика и три эффекта записи в `App.tsx` на `readStored`/`writeStored` с `localStorage`. Существующая логика разбора (`sanitizeState`, проверки полей UI, фильтр пресетов) переезжает в функции `parse`. Константы `STORAGE_*` заменить на `STORAGE_KEYS`. Тост «Параметры восстановлены» по-прежнему показывается только если ключ `state` существовал.
- [ ] **Step 6: Проверка.** `bun test && bun run typecheck && bun run lint`. Вручную: в DevTools положить `localStorage['ringforge.state'] = '{"outerD":200,"innerD":160}'` (старый формат), перезагрузить. Кольцо Ø200, после любого изменения ключ переписан в формате `{"v":1,...}`.
- [ ] **Step 7: Commit** `feat: versioned localStorage with legacy migration`.

### Task 4: Error boundary и экран сбоя

**Files:**
- Create: `src/components/ErrorBoundary.tsx`, `src/components/CrashScreen.tsx`
- Modify: `src/main.tsx`, `src/App.tsx` (обернуть `<Viewport3D>`)

**Interfaces:**
- Consumes: `clearStored`, `STORAGE_KEYS` (Task 3).
- Produces: `class ErrorBoundary extends React.Component<{ fallback: (error: Error, reset: () => void) => ReactNode; children: ReactNode }>`; `CrashScreen({ error }: { error: Error })`.

- [ ] **Step 1:** `ErrorBoundary`: `getDerivedStateFromError`, `componentDidCatch` пишет в `console.error`, `reset()` обнуляет ошибку.
- [ ] **Step 2:** `CrashScreen` — полноэкранный экран в стиле приложения. Текст: «Что-то пошло не так», «Ваши параметры сохранены в браузере. Попробуйте перезагрузить страницу.» Кнопки: «Перезагрузить» (`location.reload()`) и «Сбросить сохранённые данные» (`clearStored(localStorage, Object.values(STORAGE_KEYS))`, затем `location.reload()`). Под спойлером «Подробности» показать `error.message`.
- [ ] **Step 3:** `main.tsx`: `<StrictMode><ErrorBoundary fallback={(e) => <CrashScreen error={e} />}><App/></ErrorBoundary></StrictMode>`. Под `StrictMode` убедиться, что 3D-сцена не создаётся дважды с утечкой: в dev проверить консоль, предупреждений о двух контекстах WebGL быть не должно. Если они есть, `StrictMode` не включать и записать почему.
- [ ] **Step 4:** В `App.tsx` обернуть `<Viewport3D>` в `ErrorBoundary`, fallback вызывает существующий путь «3D недоступно»: `onViewport3DReady(false)` через `useEffect` во fallback-компоненте и рендерит пустой блок.
- [ ] **Step 5: Проверка (ручная, временная).** Вставить `throw new Error('test')` в рендер `ControlPanel`: виден `CrashScreen`, обе кнопки работают. Убрать. Вставить throw в рендер `Viewport3D`: открывается 2D-чертёж с тостом «3D недоступно». Убрать. Затем `bun run typecheck && bun run lint && bun test`.
- [ ] **Step 6: Commit** `feat: error boundaries with crash screen and 3D fallback`.

### Task 5: STL в core, экспорт без WebGL

**Files:**
- Create: `src/core/stlExport.ts`, `src/core/stlExport.test.ts`
- Modify: `src/core/constants.ts` (перенести `QUALITY_PARAMS` из `Viewport3D.tsx:25-29`), `src/components/Viewport3D.tsx` (импорт `QUALITY_PARAMS`, удалить `exportSTL` из handle), `src/App.tsx:537-551` (`handleExportSTL`)

**Interfaces:**
- Produces:
  - `QUALITY_PARAMS` в `core/constants.ts` (тот же объект, тип не меняется).
  - `async function buildSpacerSTL(s: SpacerState, a: AnalysisResult): Promise<DataView>`: берёт `QUALITY_PARAMS[s.quality] ?? QUALITY_PARAMS.std`, вызывает `buildSpacerSolid(s, a, q.seg, q.out, true, false)`, оборачивает в `THREE.Mesh`, `STLExporter().parse(mesh, { binary: true })`, освобождает геометрию. Тот же вызов, что сейчас в `Viewport3D.tsx:677-689`, только без группы и материалов.

- [ ] **Step 1: Тесты** (`stlExport.test.ts`):
  - `binary stl layout is consistent`: для `DEFAULTS` `n = dv.getUint32(80, true)`, `dv.byteLength === 84 + 50 * n`, `n > 0`.
  - `stl matches solid for all presets`: для каждого `PRESETS[i].p` (через `sanitizeState({...DEFAULTS, ...p})`) `n` равен `geometry.attributes.position.count / 3` у `buildSpacerSolid(s, a, q.seg, q.out, true, false)`.
  - `stl normals are finite`: все 3 float нормали каждого треугольника (смещение `84 + 50*i`) конечны.
  - `stl builds without DOM`: в тесте `typeof document === 'undefined'`, сборка не бросает (фиксирует, что экспорт не зависит от WebGL).
- [ ] **Step 2:** `bun test src/core/stlExport.test.ts`: FAIL.
- [ ] **Step 3:** Перенести `QUALITY_PARAMS`, реализовать `buildSpacerSTL`.
- [ ] **Step 4:** `bun test`: PASS, включая старые тесты `solidMesh`.
- [ ] **Step 5:** `handleExportSTL` в `App.tsx` вызывает `buildSpacerSTL(stateRef.current, analysis)` и больше не зависит от `vp3dRef`. Условие блокировки остаётся только `analysis.nErr > 0`. Из `Viewport3DHandle` и `controlsApiRef` убрать `exportSTL`. В `ExportModal` проверить, что кнопка STL не блокируется при `ready3d === false`; если блокируется, снять это условие.
- [ ] **Step 6: Проверка.** До изменений скачать STL для `DEFAULTS` в `before.stl`, после — в `after.stl`. Файлы побайтно равны, кроме 80-байтного заголовка: сравнить `cmp -i 80 before.stl after.stl`. `bun run typecheck && bun run lint`.
- [ ] **Step 7: Commit** `refactor: build STL in core so export works without WebGL`.

### Task 6: SVG-экспорт честно 1:1

**Files:**
- Create: `src/core/svgExport.ts`, `src/core/svgExport.test.ts`
- Modify: `src/components/Viewport2D.tsx:59-69` (`computeFit`), `:140-152` (`exportSvgString`)

**Interfaces:**
- Produces:
  - `interface Frame { x: number; y: number; w: number; h: number }`
  - `const DRAWING_MARGIN_MM = 54`
  - `exportFrame(maxR: number): Frame` — квадрат `{ x: -E, y: -E, w: 2E, h: 2E }`, где `E = maxR + DRAWING_MARGIN_MM`.
  - `applyExportFrame(svg: SVGSVGElement, f: Frame): void` выставляет `viewBox="x y w h"` (через `f2`), `width="${f2(f.w)}mm"`, `height="${f2(f.h)}mm"`.

- [ ] **Step 1: Тесты:**
  - `export frame is square around the part`: `exportFrame(100)` равно `{x:-154,y:-154,w:308,h:308}`.
  - `export frame does not depend on current zoom`: функция принимает только `maxR`. Тест вызывает её дважды с одним `maxR` и сравнивает с ожиданием, а не с `vb` компонента.
  - `units are millimetres`: фейковый объект с `setAttribute` (запись в `Map`) после `applyExportFrame(fake, {x:-10,y:-10,w:20,h:20})` даёт `width === '20mm'`, `height === '20mm'`, `viewBox === '-10 -10 20 20'`.
- [ ] **Step 2:** FAIL, Step 3: реализовать, Step 4: PASS.
- [ ] **Step 5:** `computeFit` использует `DRAWING_MARGIN_MM` вместо литерала `54`. `exportSvgString` вместо `width/height = 1400` вызывает `applyExportFrame(clone, exportFrame(analysis.maxR))`. Штамп (title block) должен целиком попадать в рамку. Если он вылезает, увеличить `DRAWING_MARGIN_MM`, а не сдвигать штамп.
- [ ] **Step 6:** PNG-снимок чертежа (`App.tsx:~555`) рисует SVG в canvas 1400×1400. Убедиться, что после изменения картинка по-прежнему заполняет холст: размеры в `mm` браузер переводит в px при загрузке в `Image`, а `drawImage(img,0,0,1400,1400)` растягивает. Проверить визуально.
- [ ] **Step 7: Проверка.** Приблизить чертёж колесом, экспортировать SVG, открыть в браузере: виден весь чертёж. В Inkscape (или по атрибутам) ширина кольца Ø180 равна 180 мм. `bun test && bun run lint`.
- [ ] **Step 8: Commit** `fix: SVG export is full drawing at true 1:1 scale in mm`.

### Task 7: Локальные шрифты, favicon, OG-картинка

**Files:**
- Modify: `index.html`, `src/main.tsx` (или `src/index.css`), `package.json`
- Create: `public/favicon.svg`, `public/og.png` (1200×630), `public/apple-touch-icon.png` (180×180)

- [ ] **Step 1:** `bun add @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono`. Импортировать веса: Sans 400/500/600/700, Mono 400/500/600 (`@fontsource/ibm-plex-sans/400.css` и т. д.), только `cyrillic` и `latin` подмножества, если пакет их разделяет. Удалить из `index.html` три тега `fonts.googleapis.com`/`fonts.gstatic.com`.
- [ ] **Step 2:** `favicon.svg` — значок из логотипа `HeaderBar` (кольцо с отверстиями). `apple-touch-icon.png` и `og.png` сделать из него: OG — логотип, «RingCraft», подзаголовок «Конструктор проставок для автодинамиков» и скриншот 3D-вида на светлом фоне. В `index.html`: `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`, `apple-touch-icon`, `og:image` и `twitter:image` с абсолютным URL `https://<домен>/og.png`. До подключения домена — `%VITE_SITE_URL%/og.png` с `VITE_SITE_URL` из env Vercel; в README отметить, что переменную надо задать.
- [ ] **Step 3: Проверка.** `bun run build && bun run preview`, во вкладке Network нет запросов к сторонним доменам, шрифты IBM Plex, кириллица на месте. Иконка во вкладке есть.
- [ ] **Step 4: Commit** `feat: self-hosted fonts, favicon and social preview image`.

## Блок C — автопроверки

### Task 8: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1:** Workflow `CI` на `push` в `main` и на `pull_request`. Job `check` на `ubuntu-latest`: `actions/checkout@v4`, `oven-sh/setup-bun@v2` (bun-version `1.3.x`), `bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun test`, `bun run build`. `concurrency` с отменой старых прогонов той же ветки.
- [ ] **Step 2: Проверка.** Локально прогнать те же команды подряд: все зелёные. Синтаксис workflow проверить `actionlint`, если он установлен.
- [ ] **Step 3: Commit** `ci: typecheck, lint, test and build on every push`.

### Task 9: Сквозной тест Playwright

**Files:**
- Create: `playwright.config.ts`, `e2e/wizard-export.spec.ts`
- Modify: `package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `data-testid="viewport-2d-svg"`, `data-testid="viewport-3d-canvas"`. Остальные элементы искать по ролям и тексту: кнопки «Далее», «Экспорт», «DXF R12», «STL (мм)», «SVG 1:1», вкладки «3D-модель», «Чертёж 1:1».

- [ ] **Step 1:** `bun add -d @playwright/test`, `bunx playwright install chromium`. Конфиг: только `chromium`, `webServer: { command: 'bun run build && bun run preview --port 4173', port: 4173 }`, `use.baseURL = 'http://localhost:4173'`, `acceptDownloads: true`. Скрипт `"e2e": "playwright test"`. Каталог `e2e/` исключить из `bun test` (скрипт `test` уже ограничен `src`).
- [ ] **Step 2: Тест `wizard to export`:** открыть `/?mode=wizard`, выбрать типоразмер «20 см», трижды нажать «Далее» (шаги Дверь → Динамик → Экспорт), открыть экспорт.
  - DXF: `download.suggestedFilename()` оканчивается на `.dxf`, содержимое содержит `AC1009` и оканчивается на `EOF\n`.
  - STL: `.stl`, `size === 84 + 50 * uint32LE(80)`, `size > 84`.
  - SVG: `.svg`, содержимое начинается с `<?xml`, содержит `width="` с `mm"` и `RingCraft`.
- [ ] **Step 3: Тест `2d and 3d views switch`:** вкладка «Чертёж 1:1» показывает `viewport-2d-svg`, «3D-модель» — `viewport-3d-canvas`; в консоли нет ошибок (`page.on('console')` собирает `error`).
- [ ] **Step 4: Тест `restores after reload`:** в «Все параметры» изменить внешний диаметр, перезагрузить, значение сохранилось.
- [ ] **Step 5:** `bun run e2e`: 3 passed.
- [ ] **Step 6:** В `ci.yml` добавить job `e2e` (после `check`): bun, `bunx playwright install --with-deps chromium`, `bun run e2e`, при падении загрузить `playwright-report` артефактом.
- [ ] **Step 7: Commit** `test: end-to-end wizard and export flow`.

## Блок D — выкладка

### Task 10: Vercel, аналитика, README

**Files:**
- Create: `vercel.json`, `README.md`
- Modify: `src/main.tsx`, `package.json`

- [ ] **Step 1:** `bun add @vercel/analytics`. В `main.tsx` рядом с `<App/>` отрендерить `<Analytics />` из `@vercel/analytics/react`.
- [ ] **Step 2:** `vercel.json`:
  - `"framework": "vite"`, `"installCommand": "bun install --frozen-lockfile"`, `"buildCommand": "bun run build"`, `"outputDirectory": "dist"`.
  - Заголовки для `/assets/(.*)`: `Cache-Control: public, max-age=31536000, immutable`.
  - Заголовки для `/(.*)`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'none'`.
- [ ] **Step 3: Проверка CSP до деплоя.** Временно отдать те же заголовки локально через `preview.headers` в `vite.config.ts` (только для `vite preview`). Пройти мастер, 3D и 2D, все экспорты, PNG-снимок. В консоли нет `Refused to ...`. Если что-то заблокировано, расширить ровно нужную директиву и записать причину в README.
- [ ] **Step 4:** `README.md` (по-русски): что это (2–3 строки + скриншот `og.png`), возможности, запуск (`bun install`, `bun run dev`), команды (`test`, `e2e`, `lint`, `build`), структура (`src/core` — логика и тесты, `src/components` — UI), деплой (Vercel Git Integration, env `VITE_SITE_URL`), лицензия MIT. Ссылку на сайт оставить заглушкой до деплоя.
- [ ] **Step 5:** `bun run typecheck && bun run lint && bun test && bun run e2e` — всё зелёное.
- [ ] **Step 6: Commit** `feat: Vercel config, security headers, analytics, README`.
- [ ] **Step 7: Шаги владельца** (исполнитель их описывает, но не выполняет):
  1. vercel.com → Add New Project → импортировать `MichailLis/RingCraft`; Framework определится как Vite.
  2. Settings → Environment Variables: `VITE_SITE_URL = https://<проект>.vercel.app`.
  3. Analytics → Enable Web Analytics.
  4. GitHub → Settings → Branches: защитить `main`, требовать PR и зелёные проверки `check` и `e2e`.
  5. После первого деплоя открыть сайт, проверить экспорт и превью ссылки (например, в Telegram).
