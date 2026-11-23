# RingCraft

Параметрический конструктор проставок и переходных рамок для автомобильных динамиков: задайте размеры в пошаговом мастере, посмотрите деталь в 3D и 2D и выгрузите чертёж или модель для печати. Всё работает на клиенте, без сервера; ваши параметры не загружаются никуда — кроме анонимной статистики посещений (Vercel Web Analytics, без cookie).

![RingCraft](public/og.png)

Сайт: [ringcraft-audio.vercel.app](https://ringcraft-audio.vercel.app/).

## Возможности

- Пошаговый мастер параметров кольца с проверкой ограничений.
- 3D-вид (three.js) и 2D-чертёж с видовым кубом.
- Экспорт: DXF, STL, SVG, PNG-снимок вида.
- Пресеты и сохранение параметров в браузере.
- Русский и английский интерфейсы с автоматическим выбором по языковым настройкам браузера.

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

Деплой через Vercel Git Integration. Шаги для владельца:

1. vercel.com → Add New Project → импортируйте `MichailLis/RingCraft` (Framework определится как Vite, остальное берётся из `vercel.json`).
2. При смене основного домена задайте `VITE_SITE_URL` для production и preview. Из него сборка формирует канонический адрес, ссылки в карточках соцсетей, `robots.txt` и `sitemap.xml`. По умолчанию используется `https://ringcraft-audio.vercel.app`.
3. Analytics → Enable Web Analytics.
4. GitHub → Settings → Branches: защитите `main`, требуйте PR и зелёные проверки `check` и `e2e`.
5. После первого деплоя откройте сайт, проверьте экспорт и превью ссылки (например, в Telegram).

Перед слиянием в `main` сделайте один preview-деплой ветки на Vercel.

- Vercel Web Analytics отключена в локальной разработке, в `vite preview` и в e2e; активна на preview-деплоях Vercel и в production.
- Vercel Toolbar на preview-деплоях блокируется CSP (скрипт с vercel.live): отключите toolbar в настройках проекта или игнорируйте; production не затронут.
- Сохранённые в браузере пресеты привязаны к адресу сайта: при переезде на новый домен пользователи начинают с чистого листа.

### Заголовки безопасности

`vercel.json` задаёт CSP (`default-src 'self'`, без внешних источников), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` и `Permissions-Policy`. `vite.config.ts` читает эти же заголовки из `vercel.json` и применяет их к `vite preview`, поэтому e2e проверяет CSP. К dev-серверу они не применяются (HMR требует inline/eval). Исключения из CSP: `style-src 'unsafe-inline'` (inline-стили React и three.js), `img-src data: blob:` (PNG-снимок и текстуры), `worker-src blob:`.

## Лицензия

MIT, см. [LICENSE](LICENSE).
