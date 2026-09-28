# Отчёт о прогоне: этап 3 (UI) — 28.09.2026

## Сводка

| Метрика | Значение |
|---------|----------|
| Проверок выполнено | 10 UI-автотестов (storefront 6, mobile 3, admin 1) + 17 API-репродьюсеров углублённого поиска + живой чекаут в контуре А; общий сьют (API+UI) — 78 |
| Пройдено / упало / заблокировано | UI: 5 / 5 / 0; общий: 35 / 43 / 0 (все падения — репродьюсеры BUG-001…012) |
| Новых дефектов | 8 (Severity: Medium 4 — BUG-005/009/010/011; Low 4 — BUG-006/007/008/012) |
| Охват областей риска | ~10 из 14 (этап 3: +11 UI-состояния, +12 SEO/заголовки, +14 конфигурация; углублённый поиск усилил 4, 5, 10; 13 и заголовки 14 — этап 4) |
| Артефакты | 117 файлов в `reports/artifacts/` (+ скриншоты чекаута в temp `ui-recon/`) |

## Проверки

| ID | Область | Проверка | Результат | Дефект |
|----|---------|----------|-----------|--------|
| TC-018 | UI/конфиг | `/dk/store` без обращений к localhost и ошибок консоли | fail | BUG-005 |
| TC-019 | UI/SEO | Несуществующий заказ → корректный 404 | fail | BUG-006 |
| TC-020 | UI/SEO | Title категорий без дублирования суффикса | fail | BUG-007 |
| TC-021 | UI | Селект количества в корзине без дублей | fail | BUG-008 |
| TC-022 | UI | Чекаут happy-path (address→delivery→payment→review→заказ) | pass (контур А) | — |
| TC-023 | UI | Мобильный 390×844: оверфлоу/меню | pass (3/3) | — |
| TC-024 | UI/Админка | orders/products/settings без 5xx | pass (с наблюдением) | — |
| TC-005 (из этапа 1) | UI | Home: hero/пустое состояние (наблюдение) | pass (observation) | — |
| TC-025 | API/доставка | `calculate` с валидным `cart_id` → 2xx/4xx (получен 500, 6/6) | fail | BUG-009 |
| TC-026 | API/Admin | Невалидные значения (11 кейсов) → 4xx (получен 500, 11/11) | fail | BUG-010 |
| TC-027 | API/регионы | Регион с несуществующей валютой отклоняется (получен 200) | fail | BUG-011 |
| TC-028 | UI/навигация | «Customer Service» ведёт на существующую страницу (получен 404) | fail | BUG-012 |

## Дефекты

| ID | Заголовок | Severity | Слой | GitHub Issue |
|----|-----------|----------|------|--------------|
| BUG-005 | `/dk/store` обращается к `http://127.0.0.1:9001` — опции не загружаются | Medium | UI | [#5](https://github.com/JakovJL/AI-QA-sandbox-test/issues/5) |
| BUG-006 | Несуществующий заказ: HTTP 200 + title «Order Confirmed» | Low | UI | [#6](https://github.com/JakovJL/AI-QA-sandbox-test/issues/6) |
| BUG-007 | Дубль title категорий «… \| Medusa Store \| Medusa Store» (апстрим dtc-starter) | Low | UI | [#7](https://github.com/JakovJL/AI-QA-sandbox-test/issues/7) |
| BUG-008 | Дубль опции в селекте количества корзины | Low | UI | [#8](https://github.com/JakovJL/AI-QA-sandbox-test/issues/8) |
| BUG-009 | `POST /store/shipping-options/{id}/calculate` → HTTP 500 на валидный `cart_id` | Medium | API | [#9](https://github.com/JakovJL/AI-QA-sandbox-test/issues/9) |
| BUG-010 | Admin API: невалидные значения (11 кейсов) → HTTP 500 | Medium | API | [#10](https://github.com/JakovJL/AI-QA-sandbox-test/issues/10) |
| BUG-011 | Регион создаётся с несуществующей валютой (`zzz`) | Medium | API | [#11](https://github.com/JakovJL/AI-QA-sandbox-test/issues/11) |
| BUG-012 | Мёртвая ссылка «Customer Service» → `/dk/customer-service` 404 | Low | UI | [#12](https://github.com/JakovJL/AI-QA-sandbox-test/issues/12) |

## Углублённый поиск (расширение области этапа 3)

- BUG-009: 500 (`unknown_error`) на валидный `cart_id` — 6/6 (обе опции, с `data` и без); пустое тело → корректный 400.
  Проверка `tests/api/shipping-calculate.spec.ts`, артефакты `reports/artifacts/store-shipping-calculate/`.
- BUG-010: Admin API — 11 кейсов невалидного ввода → 500: `offset`/`limit`/`order`/`created_at`
  (`/admin/products`, `/admin/orders`, `/admin/customers`, `/admin/inventory-items`); `POST /admin/stock-locations {}`;
  `PATCH .../stock-locations/{id} {"name":123}`; `POST /admin/regions {"currency_code":""}`.
  Для сравнения: 14 из 15 admin-эндпоинтов на пустое тело отвечают 400. Артефакты `reports/artifacts/admin-input-validation/`.
- BUG-011: `POST /admin/regions {"currency_code":"zzz"}` → 200, регион сохранён (исправлено вручную: DELETE 200).
  Тест-репродьюсер сам удаляет созданный регион; следов в данных не осталось.
- BUG-012: ссылка «Customer Service» (аккаунт, подтверждение заказа) → `/dk/customer-service` 404; маршрута нет и в исходнике dtc-starter.
- Чисто (наблюдения): математика промо 10% (10→9, скидка 1, total 9); идентичность offset-пагинации;
  трансфер заказа — accept требует токен владельца (random/empty → 400); адреса — все поля опциональны по спеке;
  `CreateCart` без `region_id` — по спеке.

## Наблюдения вне дефектов

- Home при 0 коллекций: rails не рендерятся, пустого состояния нет (по дизайну апстрима) — кандидат в UX-замечания.
- Обе shipping-опции (Standard/Express) стоят €10.00 — данные песочницы.
- Админка: фоном 401 `/admin/users/me` (до логина) и 404 `/dk/cloud/auth` (шум cloud-проверки), 5xx нет.
- Селект количества ограничен 1–10 (апстрим), кнопка удаления без aria-label, alt="" у изображений, ошибки логина простым текстом — в этап 4 (доступность/UX).
- Приманка `/blocking-fault.js` и её console.log — не дефект.

## Вердикт

Витрина и админка функциональны по основным сценариям (каталог, корзина, полный чекаут с заказом, мобильный вьюпорт, админ-экраны).
Подтверждено 8 дефектов: функционально значимые — утечка dev-конфига (`localhost:9001`, BUG-005), 500 на валидный
`calculate` (BUG-009) и системная валидационная дыра Admin API (BUG-010, тот же класс, что BUG-002/003/004), приём
несуществующей валюты региона (BUG-011); косметические/SEO/навигационные — BUG-006/007/008/012 (часть — апстрим dtc-starter).
Дальше: этап 4 — заголовки безопасности, доступность (axe), производительность/стабильность.
