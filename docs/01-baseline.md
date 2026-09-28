# 01. Базовая линия (этап 1)

> Черновик этапа 1. После утверждения — опорная карта для этапов 2–4.
> Все факты — наблюдения на 28.09.2026; «кандидат» ≠ дефект (подтверждение — только в этапе 2/3 с артефактами).

## 1. Окружение и контуры

- DNS `*.fly.dev`: на этой сети сейчас резолвится в реальный IP `66.241.125.52` (шаблонная блокировка провайдера не проявляется).
  Харнесс `config/targets.sh` сохраняет `--resolve` — безвредно и работает при возврате блокировки.
- Контур А (живой браузер): agent-browser 0.31.1 + Chrome for Testing 150, **headless выключен (headed)**, сессия `aiqa`.
  Вход в админку выполнен через auth vault (`medusa-admin`).
- Контур Б: Playwright 1.63.0 + Chromium 1243 (headless-смоук витрины — успешно).
- TypeScript-окружение: `@playwright/test`, `typescript`, `tsx`, `@medusajs/js-sdk`, `zod`, `ajv`; `npm run typecheck`.

## 2. База сравнения

- Официальные OpenAPI-спеки Medusa v2 (репозиторий `medusajs/medusa`):
  - вендорено в `vendor/openapi/store.openapi.full.yaml` и `vendor/openapi/admin.openapi.full.yaml` (тег v2.21.1, `info.version` 2.21.0);
  - для калибровки версий сверялись v2.15.0 / v2.18.0 / v2.21.1 — required-списки ключевых схем идентичны.
- Песочница спеки не отдаёт: `/store/openapi.json` → 404; `/admin/openapi.json` → 401 без токена, 404 с токеном.
- Версия песочницы не раскрывается (проверено: заголовки ответов, `/admin/plugins`, бандл `/app/assets/index-*.js`, sourcemap отсутствует).
  Рабочее допущение — A-001 (≈2.21.x).
- Вторая линия сравнения: наблюдаемое поведение и внутренняя согласованность (Store ↔ Admin ↔ UI).

## 3. Данные песочницы (снимок)

| Сущность | Кол-во | Примечание |
|---|---|---|
| products / variants | 4 / 20 | sweatshirt, t-shirt, sweatpants, shorts |
| categories / collections | 4 / 0 | Shirts, Sweatshirts, Pants, Merch |
| tags / types | 1 / 0 | `bug-demo-tag` на Sweatshirt |
| orders / draft orders / claims / returns | 4 / 0 / 0 / 0 | в админке есть чужие тестовые заказы |
| customers / customer groups | 3 / 0 | |
| regions | 1 | Europe, `eur`, страны: dk,fr,de,it,es,se,gb |
| sales channels | 1 | `sc_01M392A8EVAKJBZCX9G8AHBMG0` |
| stock locations / inventory items / reservations | 1 / 20 / 3 | |
| promotions / price lists | 0 / 0 | |
| stores / users / api-keys | 1 / 1 / 1 | |
| currencies / tax regions | 126 / 7 | |
| shipping options / profiles / fulfillment providers | 2 / 1 / 1 | |
| plugins / workflow executions | 1 / 4 | plugin: `@medusajs/draft-order` |

Цены вариантов: `eur`, 10.00. Sweatshirt помечен правками после сидинга (`updated_at` 25.09), у него `origin_country: "af"`, тег `bug-demo-tag`.

Артефакт песочницы: `/blocking-fault.js` — декоративный скрипт-приманка `console.log("...you found a bug...")`, подключён в `<head>` витрины; дефектом не является.

## 4. Карта витрины (storefront)

| Маршрут | Наблюдение |
|---|---|
| `/` | 307 → `/dk` |
| `/dk` | 200, домашняя |
| `/dk/products/{sweatshirt,t-shirt,sweatpants,shorts}` | 200 |
| `/dk/categories/{shirts,sweatshirts,pants,merch}` | 200 |
| `/dk/cart`, `/dk/account` | 200 |
| `/dk/order/{id}/confirmed` | 200 даже для несуществующего `id=123` (клиентская страница; проверка — этап 3) |
| `/dk/search?q=...` | 404 — маршрута поиска нет; ссылки в UI нет (сверка со starter — этап 3) |
| `/dk/nonexistent-route-xyz` | 404 (корректно) |
| `/robots.txt`, `/sitemap.xml`, `/openapi.json` | 200, но HTML витрины (эффективных файлов нет) |
| `/us` | 307 → `/dk/us` → 404 (региональный префикс middleware) |

- Цены: `€10.00` на карточке товара и в категории — соответствует региональному `eur`. Заметка прошлой сессии про `$` ошибочна (снято).
- Метаданные: `og:image`/`twitter:image` → `http://127.0.0.1:8000/...`.
- Заголовки витрины: `x-powered-by: Next.js`, `cache-control: no-store`, `set-cookie: _medusa_cache_id`; HSTS/CSP/X-Frame-Options/X-Content-Type-Options не обнаружены.

### Подэтап 3 (UI) — результаты

- UI-1: `/dk/store` выполняет `GET http://127.0.0.1:9001/store/product-options` → `ERR_CONNECTION_REFUSED` + console error
  «Failed to fetch product options» (бандл `1009-*.js`). Тот же класс, что og:image→127.0.0.1:8000 (TC-004). Тест UI-1, артефакты `reports/artifacts/ui-storefront/ui-1-*`.
- UI-2: `/dk/order/<fake>/confirmed` → HTTP 200, title «Order Confirmed», содержимое «Page not found» (soft-404). Тест UI-2.
- UI-3: title категорий «Shirts | Medusa Store | Medusa Store» — баг апстрима dtc-starter (подтверждено по исходнику). Тест UI-3.
- UI-4: селект количества в корзине содержит дубль текущего значения: `["Select...","1"…"10","1"]`. Тест UI-4.
- Чекаут UI (контур А): полный happy-path address → delivery → payment (Manual) → review → заказ
  `order_01M3KPSPKBY4W3694XFA3S1P6F` (страница «Thank you!…», корзина обнулилась). Обе shipping-опции по €10.00 — наблюдение данных.
- Мобильный 390×844: главная/store/PDP без горизонтального оверфлоу, меню открывается (3/3).
- Админка (контур Б с логином): orders/products/settings открываются, 5xx нет; фоном 401 `/admin/users/me` (до логина) и
  404 `/dk/cloud/auth` — наблюдение (шум cloud-проверки), на работу не влияет.
- Home при 0 коллекций не показывает rails и пустого состояния (наблюдение UI-5, по дизайну апстрима).

### Углублённый поиск после чекпойнта 3.2 (28.09.2026)

- Системность валидационной дыры: отрицательные `limit`/`offset`, пустой `order=`, пустые date-фильтры → 500
  воспроизводятся и в **Admin API** (`/admin/products`, `/admin/orders`, `/admin/customers`, `/admin/inventory-items`),
  и на большинстве Store list-эндпоинтов (categories, collections, regions, product-variants, product-types, product-tags, return-reasons, products?created_at=).
- Новые дефекты: BUG-009 (calculate 500), BUG-010 (admin-валидация → 500), BUG-011 (регион с валютой `zzz` принимается),
  BUG-012 (мёртвая ссылка `/dk/customer-service`).
- Чисто: математика промо (10% → total 9), идентичность offset, трансфер заказа (accept требует токен владельца: random/empty → 400),
  адреса (все поля опциональны по спеке), `CreateCart` без `region_id` (по спеке), пагинация Admin (`count` корректен).
- Наблюдения: заказ читается по id без auth (по докам — guest access, id как capability-URL); запрос трансфера чужого заказа
  создаётся любым авторизованным клиентом (подтверждение — токеном владельца); пароль «123» принимается (политики пароля нет).

## 5. Карта Admin UI

- `/app` → по умолчанию Orders.
- Разделы: `/app/orders`, `/app/draft-orders`, `/app/products`, `/app/collections`, `/app/categories`, `/app/inventory`, `/app/reservations`, `/app/customers`, `/app/customer-groups`, `/app/promotions`, `/app/campaigns`, `/app/price-lists`.
- Настройки: `/app/settings` (+ `store`, `locations`, `product-tags`, `product-types`, `profile`, `publishable-api-keys`, `refund-reasons`, `regions`, `return-reasons`, `sales-channels`, `search`, `secret-api-keys`, `tax-regions`, `users`, `workflows`), детальные: `/app/settings/store/metadata/edit`, `/app/settings/sales-channels/{id}`.
- Неизвестный маршрут → страница «404 — There is no page at this address» (корректная обработка; эталон для витрины).
- `/app/settings/shipping-options` → 404: такого маршрута нет (не дефект).

## 6. Карта Store API (живая проверка)

- Работают: `/store/products`, `/store/products/{id}`, `/store/product-categories`, `/store/product-tags`, `/store/product-types`, `/store/collections`, `/store/regions`, `/store/carts/{id}`, `/store/payment-providers?region_id`, `/store/shipping-options?cart_id`.
- Требуется `x-publishable-api-key`; покупательские маршруты — Bearer JWT (`/store/customers/me`, `/store/orders` → 401 без токена).
- Форматы ошибок: 400 `{"type":"invalid_data","message":...}`; 404 `{"type":"not_found","message":...}`; 401 `{"message":"Unauthorized"}`; 500 `{"code":"unknown_error","type":"unknown_error","message":"An unknown error occurred."}`.
- Кандидат S-1: `/store/products` возвращает `count` = размер страницы, а не общее число
  (`limit=1→1`, `2→2`, `3→3`, `0→0`, `offset=100&limit=1→0`), при этом `/admin/products` даёт `count=4`,
  а `/store/product-categories` — корректный `count=4`. Изолировано на `/store/products`.
  Спека (StoreProductListResponse): `count` — «The total count of items». Детерминированные проверки: `tests/api/store-products-count.spec.ts`
  (6 падений), артефакты `reports/artifacts/store-products-count/`.
- Кандидат S-2: `limit=-1` и `offset=-1` → HTTP 500 (`unknown_error`); при этом `limit=abc`/`offset=abc` → корректный 400
  `{"type":"invalid_data","message":"Invalid request: Expected type: 'number' ..."}` — т.е. тип проверяется, диапазон — нет.
  Проверки: `tests/api/store-input-validation.spec.ts`, артефакты `reports/artifacts/store-input-validation/`.
- Подэтап 2.3 (Store↔Admin дифф) — расхождений нет: `tests/api/store-admin-diff.spec.ts` 5/5
  (наборы товаров, названия/handles, наборы вариантов, цены eur, доступный инвентарь; Store = available Admin).
  Store API не отдаёт `variants.sku` (поле не входит в разрешённые — отбрасывается молча, ожидаемо).
- Подэтап 2.4 (корзина/чекаут) — зелёный: `tests/api/cart-checkout.spec.ts` 11/11.
  Флоу: cart → 2×10 EUR → email/адреса (dk) → shipping (итог заказа 30) → payment `pp_system_default` → `type: order`;
  повторный `complete` идемпотентен (тот же order, дубля нет); заказ доступен гостю по id (200);
  резерв +2 / available −2; oversell (`available+1`) → 400 `insufficient_inventory`; quantity 0/-1/abc → 4xx.
- Подэтап 2.5 (фаззинг Schemathesis 4.28.0, GET-only: 33 операции, 602 кейса, 903 c) — 11 server error + 9 content-type.
  Изоляция:
  (а) пустое/невалидное значение `order` → 500 (products, regions, collections, return-reasons) — драфт BUG-003;
  (б) пустой/невалидный `updated_at`/`created_at` → 500 (product-categories, collections, product-options) — драфт BUG-004;
  (в) отрицательный `offset` в научной нотации (`-5.96e-08`) → тот же корень, что BUG-002;
  (г) 9 «Undocumented Content-Type» — известное расхождение спеки (401 `application/json` vs `text/plain`), Store/Admin согласованы.
  Сводка и лог: `reports/artifacts/schemathesis/summary.md`, `run.log`.
- Наблюдение TC-013: required-поля ряда Store-ответов не совпадают со спекой (products: `status`/`external_id`/`deleted_at`;
  categories: `deleted_at`; currencies/страны: timestamps/`id`); для currencies и стран Store и Admin согласованы между собой,
  для products Store беднее Admin. Вердикт — на чекпойнте (вероятна неточность спеки, а не дефект песочницы).
- Наблюдение: неизвестный `category_id` тихо игнорируется (200, пустой список). Дефолтные лимиты: categories 50, collections 10.
- Наблюдение: дробный `limit=1.5` принимается (200).

## 7. Карта Admin API (живая проверка с токеном)

- 200: groups/products/variants/categories/collections/tags/types/orders/customers/customer-groups/regions/sales-channels/stock-locations/inventory-items/reservations/promotions/price-lists/stores/users/api-keys/currencies/tax-regions/shipping-options/shipping-profiles/fulfillment-providers/returns/claims/draft-orders/plugins/workflows-executions.
- Ожидаемые 404: `/admin/store` (в v2 — `/admin/stores`), `/admin/openapi.json`, `fulfillment-sets`, `notification-providers`, `payment-collections`, `order-edits` (у этих сущностей иные пути).
- `count` корректен: `/admin/products?limit=1` → `count=4`.

## 8. Приоритеты риска

1. Корзина/чекаут: полный флоу, inventory, complete, повторные вызовы.
2. Валидация входов и коды ошибок (кандидат S-2 → вероятны другие 500).
3. Пагинация/фильтры/поиск (кандидат S-1).
4. Store ↔ Admin согласованность (товары, цены, заказы, инвентарь).
5. Границы аутентификации (Store/Admin, customer/admin).
6. NFR: заголовки безопасности, доступность, стабильность — этап 4.

## 9. Открытые вопросы

- Точная версия Medusa песочницы (не раскрывается; см. A-001).
- Соответствие витрины стоковому starter (нужно для оценки «нет поиска/коллекций») — этап 3.
