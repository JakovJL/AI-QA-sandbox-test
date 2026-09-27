# Диаграммы проекта

> Живые PNG — ниже; исходники Mermaid — в конце файла (GitHub рендерит их тоже).

## PNG-галерея

![Архитектура цели](assets/1-architecture.png)

![Стратегия: два контура и поток находок](assets/2-strategy.png)

![DNS-блокировка и обход](assets/3-dns-bypass.png)

![Карта рисков по этапам](assets/4-risk-map.png)

---

## Исходники Mermaid

## 1. Архитектура цели

```mermaid
flowchart LR
  subgraph Clients["Клиенты"]
    B1["Покупатель — браузер"]
    B2["Админ — браузер"]
  end

  subgraph Fly["Fly.io — sandbox (66.241.125.52)"]
    SF["Next.js Storefront (SSR), /dk/*"]
    ADM["Medusa Admin SPA, /app"]
    API["Medusa v2 Backend (Express)"]
  end

  DB[("PostgreSQL")]
  S3["Medusa Public Images (S3)"]

  B1 -->|"HTTPS /dk/*"| SF
  B2 -->|"HTTPS /app"| ADM
  SF -->|"/store API"| API
  ADM -->|"/admin API (JWT)"| API
  API --> DB
  SF -.->|"картинки"| S3
```

## 2. Стратегия: два контура и поток находок

```mermaid
flowchart TB
  subgraph A["Контур А — живой браузер (Edge, DoH)"]
    UA["Browser MCP / DevTools MCP"]
    EX["Агентное исследование UI"]
    UA --> EX
  end

  subgraph B["Контур Б — изолированный Playwright (chromium)"]
    DET["Детерминированные проверки (TS)"]
    ART["Артефакты: trace, HAR, скриншоты"]
    DET --> ART
  end

  APIW["API-слой: curl/bash + TS + SDK Medusa"]
  NFR["NFR: axe, Lighthouse, нагрузка, ZAP"]

  REG[("Реестры: требования, кейсы, допущения")]
  BUG[("Багрепорты BUG-XXX + сводный отчёт")]

  EX -->|"находка"| HYP["Гипотеза + сырой артефакт"]
  HYP --> DET
  APIW --> HYP
  NFR --> HYP
  DET -->|"подтверждено"| BUG
  HYP --> REG
  BUG --> REG
```

## 3. Окружение: DNS-блокировка и обход

```mermaid
flowchart LR
  PC["Этот ПК"] -->|"? fly.dev"| RTR["Роутер 192.168.0.1"]
  RTR -->|"DNS"| ISP["Резолвер A1"]
  ISP -.->|"подмена: 185.61.104.70/.71 (заглушка)"| X["Страница 'Доступ ограничен'"]

  PC -->|"DoH (HTTPS)"| CF["Cloudflare 1.1.1.1"]
  CF -->|"честный ответ: 66.241.125.52"| PC

  PC -->|"curl --resolve host:443:66.241.125.52"| FLY["Fly.io sandbox — HTTP 200"]

  EDGE["Edge с Secure DNS"] --> CF
```

## 4. Карта рисков (14 областей, порядок этапов)

```mermaid
flowchart TB
  subgraph E2["Этап 2 — API"]
    R1["Каталог/пагинация"]
    R2["Корзина"]
    R3["Промо и скидки"]
    R4["Регионы/валюты/налоги"]
    R5["Доставка/оплата"]
    R6["Чекаут"]
    R7["Аутентификация"]
    R8["Инвентарь"]
    R9["Админка: права"]
    R10["Контракты/ошибки"]
  end

  subgraph E3["Этап 3 — UI"]
    R11["Состояния витрины"]
    R12["Чекаут в UI, мобайл"]
  end

  subgraph E4["Этап 4 — NFR"]
    R13["Стабильность/перф"]
    R14["Безопасность: CORS, заголовки, rate-limit"]
  end

  E2 --> E3 --> E4
```
