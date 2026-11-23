# RingCraft

Параметрический CAD-редактор колец в браузере: задайте размеры в пошаговом мастере, посмотрите кольцо в 3D и 2D и выгрузите чертёж или модель для печати. Всё работает на клиенте, без сервера и без загрузки данных куда-либо.

![RingCraft](public/og.png)

Сайт: _ссылка появится после первого деплоя_

## Возможности

- Пошаговый мастер параметров кольца с проверкой ограничений.
- 3D-вид (three.js) и 2D-чертёж с видовым кубом.
- Экспорт: DXF, STL, SVG, PNG-снимок вида.
- Пресеты и сохранение параметров в браузере.
- Русский интерфейс.

## Запуск

```sh
bun install
bun run dev
```

Dev-сервер откроется на http://localhost:3000.

## Команды

| Команда             | Что делает                                                                    |
| ------------------- | ----------------------------------------------------------------------------- |
| `bun test`          | Юнит-тесты (`src/core`)                                                       |
| `bun run typecheck` | Проверка типов TypeScript                                                     |
| `bun run lint`      | ESLint                                                                        |
| `bun run format`    | Prettier (`format:check` только проверяет)                                    |
| `bun run build`     | Production-сборка в `dist`                                                    |
| `bun run preview`   | Локальный просмотр сборки (с теми же заголовками безопасности, что и в проде) |
| `bun run e2e`       | Сквозные тесты Playwright против `vite preview`                               |

Перед первым запуском e2e установите браузер: `bunx playwright install chromium`.

## Структура

- `src/core` — вся логика (геометрия, ограничения, экспорт, хранилище) и её тесты.
- `src/components` — React-компоненты интерфейса.
- `e2e` — сквозные тесты Playwright.
- `vercel.json` — конфигурация деплоя и заголовки безопасности.

## Деплой

Деплой через Vercel Git Integration: импортируйте репозиторий, Framework определится как Vite, остальное берётся из `vercel.json`.

- Переменная окружения `VITE_SITE_URL` (значение по умолчанию `https://ringcraft.vercel.app`) задаёт адрес сайта для мета-тегов и превью ссылок. Укажите в Vercel реальный адрес проекта.
- Vercel Web Analytics подключается только в сборках на Vercel (`__VERCEL__`); локально, в preview и в e2e запросов к аналитике нет.

### Заголовки безопасности

`vercel.json` задаёт CSP (`default-src 'self'`, без внешних источников), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` и `Permissions-Policy`. `vite.config.ts` читает эти же заголовки из `vercel.json` и применяет их к `vite preview`, поэтому e2e проверяет CSP. К dev-серверу они не применяются (HMR требует inline/eval). Исключения из CSP: `style-src 'unsafe-inline'` (inline-стили React и three.js), `img-src data: blob:` (PNG-снимок и текстуры), `worker-src blob:`.

## Лицензия

MIT, см. [LICENSE](LICENSE).
