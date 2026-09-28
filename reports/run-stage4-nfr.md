# Отчёт о прогоне: этап 4 (NFR) — 28.09.2026

## Сводка

| Метрика | Значение |
|---------|----------|
| Проверок выполнено | 31 NFR-автотест: security-headers 5, security-perimeter 5, a11y 7, auth 4, perf 10 |
| Пройдено / упало / заблокировано | 17 / 14 / 0 (все падения — репродьюсеры подтверждённых дефектов) |
| Новых дефектов | 7 (Severity: Medium 4 — BUG-013/014/015/016; Low 3 — BUG-017/018/019) |
| Охват областей риска | 13 (производительность/стабильность) — чист; 12 и 14 закрыты подтверждёнными дефектами и наблюдениями |
| Артефакты | 164 файла в `reports/artifacts/` (в т.ч. блоки `nfr-headers/`, `nfr-perimeter/`, `nfr-a11y/`, `nfr-auth/`, `nfr-perf/`) |

## Проверки

| ID | Область | Проверка | Результат | Дефект |
|----|---------|----------|-----------|--------|
| TC-005 | Безопасность | HSTS/CSP/X-Frame-Options/X-Content-Type-Options на витрине, `/app`, Store/Admin API | fail | BUG-013 |
| TC-030 | Безопасность | Кликджекинг: `/dk` и `/app` встраиваются в чужой iframe | fail | BUG-013 |
| TC-031 | HTTP-семантика | Корневые несуществующие «файловые» пути → 200 HTML | fail | BUG-019 |
| TC-032 | Доступность | Формы без доступных имён (checkout, account, cart, Admin login) | fail | BUG-014 |
| TC-033 | Доступность | Кнопки без доступного имени (cart, PDP, разделы Admin) | fail | BUG-015 |
| TC-034 | Доступность | Изображения без `alt` (витрина и Admin products) | fail | BUG-016 |
| TC-035 | Доступность | Контраст текста ниже WCAG AA | fail | BUG-017 |
| TC-036 | Доступность | Ссылки без текста + вложенный интерактив (апстрим dtc-starter) | fail | BUG-018 |
| TC-037 | Границы auth | Изоляция customer/admin токенов; подделка токена | pass (4/4) | — |
| TC-038 | Производительность | Latency/stability baseline: 9 эндпоинтов × 2×10 замеров | pass (10/10) | — |
| TC-039 | Инфраструктура | HTTP :80 (socket hang up, редиректа нет) | наблюдение | — |

## Дефекты

| ID | Заголовок | Severity | Слой | GitHub Issue |
|----|-----------|----------|------|--------------|
| BUG-013 | Нет HSTS/CSP/XFO/XCTO; витрина и `/app` встраиваются в iframe; нет HTTP→HTTPS редиректа | Medium | API/UI | [#13](https://github.com/JakovJL/AI-QA-sandbox-test/issues/13) |
| BUG-014 | Элементы форм без доступных имён (checkout ×8+select, account, cart, Admin login) | Medium | UI | [#14](https://github.com/JakovJL/AI-QA-sandbox-test/issues/14) |
| BUG-015 | Иконочные кнопки без доступного имени (cart, PDP, разделы Admin) | Medium | UI | [#15](https://github.com/JakovJL/AI-QA-sandbox-test/issues/15) |
| BUG-016 | Изображения без альтернативного текста (витрина и Admin products) | Medium | UI | [#16](https://github.com/JakovJL/AI-QA-sandbox-test/issues/16) |
| BUG-017 | Недостаточный контраст текста (axe color-contrast) | Low | UI | [#17](https://github.com/JakovJL/AI-QA-sandbox-test/issues/17) |
| BUG-018 | Ссылки без различимого текста + nested-interactive (футер/поповер, апстрим) | Low | UI | [#18](https://github.com/JakovJL/AI-QA-sandbox-test/issues/18) |
| BUG-019 | Корневые «файловые» пути (`.env` и др.) → 200 HTML вместо 404 | Low | UI | [#19](https://github.com/JakovJL/AI-QA-sandbox-test/issues/19) |

## Наблюдения вне дефектов

- CORS: чужой Origin не отражается (Store и Admin), `access-control-allow-credentials` без `allow-origin` безвреден.
- TRACE — не 200; `/.git/config`, `/metrics`, `/debug`, `/server-status` не раскрываются; `/health` → 200 «OK» (ожидаемо, Medusa).
- HTTP :80 не обслуживается (`socket hang up`) — кандидат на отдельный BUG-020 при необходимости.
- Троттлинга на `/auth/customer/emailpass` нет: 6 неудачных логинов → 401 (429 отсутствует) — по A-005 не дефект.
- `_medusa_cache_id` без HttpOnly/Secure/SameSite; `x-powered-by: Next.js/Express` — минорные замечания.
- Производительность: 0 ошибок/таймаутов; медианы 94–409 мс, p95 ≤ 617 мс (`/store/products`), повторный прогон стабилен; «рваная стабильность» из этапа 1 не воспроизвелась.
- В a11y-кандидаты брались только нарушения impact critical/serious; moderate/minor остаются в axe-артефактах.

## Вердикт

Безопасность периметра слабая: базовые заголовки отсутствуют на всех поверхностях, витрина и админка фреймятся (кликджекинг),
служебные «файловые» пути маскируются под успешные. Доступность системно нарушена и на витрине (формы, изображения, контраст,
апстрим-навигация), и в админке (кнопки, изображения). Границы аутентификации корректны; производительность и стабильность в норме
(baseline зафиксирован). Дальше: этап 5 — сводный отчёт по дефектам.
