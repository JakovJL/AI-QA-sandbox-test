# Скриншоты sandbox-магазина

Сняты headless Edge (CDP) с обходом DNS-блокировки (`--host-resolver-rules`).
Десктоп 1440×1000, мобильные — 390×844.

## Структура

### `storefront/` — витрина (десктоп)

| Файл | Что на кадре |
|---|---|
| 01-home-dk.png | главная `/dk` |
| 02-product-sweatshirt.png | товар Medusa Sweatshirt |
| 03-category-shirts-take1.png | категория Shirts (первый дубль) |
| 05–08-category-*.png | категории: shirts, sweatshirts, pants, merch |
| 09–11-product-*.png | товары: t-shirt, sweatpants, shorts |
| 12-search-empty.png | поиск с пустым `q` → **HTTP 404** |
| 13-search-shirt.png | поиск «shirt» → **HTTP 404** |
| 14-404-page.png | несуществующая страница |

### `mobile/` — витрина 390×844

| Файл | Что на кадре |
|---|---|
| 15-mobile-home.png | главная |
| 16-mobile-product.png | карточка товара |
| 17-mobile-category.png | категория |

### `admin/` — Medusa Admin (`/app`), залогиненная сессия

| Файл | Что на кадре |
|---|---|
| 04-admin-login-old.png | логин (первый дубль) |
| 20-admin-login.png | экран логина |
| 21-admin-dashboard.png | дашборд (Orders view) |
| 22-admin-products.png | список товаров |
| 23-admin-product-detail.png | карточка Sweatshirt в админке |
| 24-admin-orders.png | заказы (в sandbox есть чужие тестовые заказы) |
| 25-admin-categories.png | категории |
| 26-admin-customers.png | клиенты |
| 27-admin-promotions.png | промо-акции (пусто) |
| 28-admin-inventory.png | инвентарь |
| 29-admin-settings.png | настройки стора |

## Находки со скриншотов

- Поиск витрины отдаёт 404 при любом `q` (см. `docs/PLAN.md`, кандидаты §12); маршрута и ссылки в UI нет —
  сверка со стоковым starter на этапе 3.
- Цены на `/dk` — `€10.00` (регион Europe, eur): корректно. Более ранняя заметка про `$` не подтвердилась
  и исправлена 28.09.2026 (актуальная база — `docs/01-baseline.md`).
