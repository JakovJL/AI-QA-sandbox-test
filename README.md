# AI-QA sandbox test

Тестирование sandbox-магазина (Medusa v2 + Next.js storefront) через AI: агентное исследование,
MCP-инструменты, детерминированное подтверждение находок. План и процесс — `docs/PLAN.md`.
Язык автоматизации — TypeScript; bash-скрипты остаются для ручных запросов.

## Статус

Программа этапов 0–5 завершена 28.09.2026: **19 подтверждённых дефектов** (12 Medium / 7 Low),
Issues #1–#19 в GitHub; у каждого — детерминированный репродьюсер и сырые артефакты.
Итоги, вердикт и рекомендации — **`reports/final-summary.md`**.

| Сьют | Команда | Тестов | Passed / Failed |
|------|---------|--------|------------------|
| API | `npm run test:api` | 68 | 30 / 38 |
| UI | `npm run test:ui` | 10 | 5 / 5 |
| NFR | `npm run test:nfr` | 31 | 17 / 14 |

Падения — **по замыслу**: это репродьюсеры зарегистрированных дефектов (красный сьют = баг воспроизводится).

## Структура

```
docs/PLAN.md            программа тестирования (этапы, области, методология; статусы — §2.1)
docs/00-environment.md  окружение: DNS-блокировка провайдера и обход
docs/01-baseline.md     базовая линия этапа 1: карта эндпоинтов/страниц, данные, кандидаты
docs/SESSION-2026-09-28.md  передача контекста между сессиями
config/                 харнесс доступа к цели (--resolve через DoH, режим определяется автоматически)
scripts/                resolve-doh.sh, api.sh, check-spec-required.mts
lib/                    TypeScript-харнесс (env/http/api/artifacts)
tests/                  Playwright: tests/api, tests/ui, tests/nfr (репродьюсеры дефектов)
registry/               реестры: требования-по-наблюдению, допущения, кейсы
reports/bugs/           багрепорты BUG-001…019
reports/run-stage*.md   отчёты прогонов этапов 2–4
reports/final-summary.md  итоговый отчёт этапа 5
reports/artifacts/      сырые улики прогонов (JSON/HAR/скриншоты, 17 блоков)
reports/templates/      шаблоны: багрепорт, сводный отчёт прогона
vendor/openapi/         вендоренные OpenAPI-спеки Medusa v2
```

## Быстрый старт

```bash
npm install && npm run typecheck      # TS-окружение и проверка типов (контур Б: Playwright)
npm run test:api                      # API-сьют (падения — репродьюсеры дефектов)
npm run test:ui                       # UI-сьют (storefront/mobile/admin)
npm run test:nfr                      # NFR: заголовки, perimeter, axe, auth, perf
bash scripts/resolve-doh.sh           # реальный IP цели (обход DNS-фильтра провайдера)
bash scripts/api.sh GET '/store/products?limit=2'
bash scripts/api.sh --admin GET '/products?limit=1'
```

Секреты — в локальном `.env` (в git не попадает; шаблон — `.env.example`).
