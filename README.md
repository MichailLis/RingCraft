# RingCraft

![RingCraft — конструктор проставок для автодинамиков](public/og.png)

**[Открыть RingCraft · Open live demo](https://ringcraft-audio.vercel.app/)**

Параметрический онлайн-конструктор проставочных колец и переходных рамок для автомобильных динамиков. Задайте размеры и крепёж, проверьте модель в 3D и скачайте чертёж для фрезеровки или модель для 3D-печати.

Browser-based CAD for car speaker spacer rings and adapters. Preview your design in 3D or as a 2D drawing and export DXF, STL, SVG, or PNG. The interface is available in English and Russian.

## Возможности

- Пошаговый мастер параметров кольца с проверкой ограничений.
- 3D-вид (three.js) и 2D-чертёж с видовым кубом.
- Экспорт: DXF, STL, SVG, PNG-снимок вида.
- Пресеты и сохранение параметров в браузере.
- Русский и английский интерфейсы с автоматическим выбором по языковым настройкам браузера.

![Редактор RingCraft с 3D-моделью проставки и панелью размеров](docs/images/ringcraft-editor.png)

Параметры модели и пользовательские пресеты хранятся локально в браузере. На размещённом сайте Vercel Web Analytics собирает статистику посещений без cookies.

## Запуск

Для локального запуска установите Bun 1.3.x и Node.js 22.12 или новее.

```sh
bun install --frozen-lockfile
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

## Лицензия

MIT, см. [LICENSE](LICENSE).
