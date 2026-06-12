# ПЛАН РАЗРАБОТКИ: ModrinthAI Search
> AI-поиск модпаков на Modrinth через естественный язык, с веб-интерфейсом и поддержкой любых LLM-провайдеров

---

## Обзор проекта

**Что делает приложение:**
Пользователь пишет на естественном языке («хочу модпак с магией и технологиями для 1.20.1 на Fabric, не слишком хардкорный»), нейросеть разбирает запрос и строит оптимальный поисковый запрос к Modrinth API, затем ранжирует и объясняет результаты.

**Стек:**
- **Backend:** Node.js + Express (или Fastify)
- **Frontend:** Vanilla JS / HTML / CSS (один файл, без фреймворков — легко расширяется)
- **AI-слой:** абстрактный провайдер-адаптер (OpenAI, Anthropic, Ollama, OpenRouter, любой OpenAI-совместимый)
- **Modrinth API:** `https://api.modrinth.com/v2/search`

---

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│                    БРАУЗЕР                          │
│  ┌──────────────────────────────────────────────┐  │
│  │            Web UI (index.html)               │  │
│  │  • Чат-интерфейс для промпта                 │  │
│  │  • Карточки модпаков с результатами          │  │
│  │  • Настройки провайдера (без перезагрузки)   │  │
│  └──────────────┬───────────────────────────────┘  │
└─────────────────┼───────────────────────────────────┘
                  │ HTTP (REST)
┌─────────────────┼───────────────────────────────────┐
│         BACKEND (Node.js + Express)                 │
│                 │                                   │
│  ┌──────────────▼──────────────┐                   │
│  │       API Router            │                   │
│  │  POST /api/search           │                   │
│  │  GET  /api/providers        │                   │
│  │  POST /api/providers/test   │                   │
│  └──────────────┬──────────────┘                   │
│                 │                                   │
│  ┌──────────────▼──────────────┐                   │
│  │    AI Orchestrator          │  ← основная логика │
│  │  1. buildSearchQuery()      │                   │
│  │  2. fetchFromModrinth()     │                   │
│  │  3. rankAndExplain()        │                   │
│  └──────┬──────────┬───────────┘                   │
│         │          │                               │
│  ┌──────▼──┐  ┌────▼────────────────────────────┐ │
│  │Modrinth │  │    Provider Manager             │ │
│  │  Client │  │  ┌──────────┐ ┌──────────────┐  │ │
│  │         │  │  │ OpenAI   │ │  Anthropic   │  │ │
│  │ /search │  │  │ Adapter  │ │  Adapter     │  │ │
│  │ /tags   │  │  └──────────┘ └──────────────┘  │ │
│  └─────────┘  │  ┌──────────┐ ┌──────────────┐  │ │
│               │  │  Ollama  │ │  OpenRouter  │  │ │
│               │  │ Adapter  │ │  Adapter     │  │ │
│               │  └──────────┘ └──────────────┘  │ │
│               │  ┌──────────────────────────┐    │ │
│               │  │  Custom (любой OpenAI-   │    │ │
│               │  │  compatible endpoint)    │    │ │
│               │  └──────────────────────────┘    │ │
│               └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Структура файлов

```
modrinth-ai-search/
│
├── package.json
├── .env.example              # шаблон переменных среды
├── .gitignore
│
├── server/
│   ├── index.js              # точка входа, Express-сервер
│   ├── router.js             # маршруты API
│   │
│   ├── providers/
│   │   ├── base.js           # абстрактный класс BaseProvider
│   │   ├── openai.js         # OpenAI + Azure OpenAI
│   │   ├── anthropic.js      # Anthropic (Claude)
│   │   ├── ollama.js         # Ollama (локальные модели)
│   │   ├── openrouter.js     # OpenRouter (100+ моделей)
│   │   └── custom.js         # любой OpenAI-compatible endpoint
│   │
│   ├── providerManager.js    # реестр провайдеров, фабрика
│   │
│   ├── modrinth/
│   │   ├── client.js         # обёртка над Modrinth API v2
│   │   └── facets.js         # хелперы для построения facets
│   │
│   ├── orchestrator.js       # главная логика: prompt → results
│   └── prompts.js            # системные промпты для AI
│
├── public/
│   ├── index.html            # SPA — весь фронтенд
│   ├── style.css
│   └── app.js
│
└── config/
    └── providers.json        # сохранённые настройки провайдеров
```

---

## Этапы разработки

### Этап 0 — Настройка проекта (0.5 часа)

- [ ] `npm init`, установить зависимости: `express`, `cors`, `dotenv`, `node-fetch`
- [ ] Создать `.env.example` с примерами ключей
- [ ] Настроить `nodemon` для разработки
- [ ] `git init`, добавить `.gitignore`

**Зависимости:**
```json
{
  "express": "^4.18",
  "cors": "^2.8",
  "dotenv": "^16",
  "node-fetch": "^3"
}
```

---

### Этап 1 — Провайдер-система (2 часа)

**Цель:** любой LLM «подключается» через единый интерфейс.

#### 1.1 Абстрактный базовый класс `BaseProvider`

```js
// server/providers/base.js
class BaseProvider {
  constructor(config) {
    this.name = config.name;
    this.config = config;
  }

  // Обязательный метод — каждый провайдер реализует свой
  async complete(messages, options = {}) {
    throw new Error('complete() must be implemented');
  }

  // Проверка связи
  async ping() {
    try {
      await this.complete([{ role: 'user', content: 'Hi' }], { max_tokens: 5 });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}
```

#### 1.2 Адаптеры провайдеров

Каждый адаптер принимает `config` и реализует `complete(messages, options)`.

**OpenAI-адаптер** (`server/providers/openai.js`):
```js
// поля config: apiKey, baseURL (опц.), model
// baseURL по умолчанию: https://api.openai.com/v1
// Этот же адаптер работает для Azure OpenAI (другой baseURL)
```

**Anthropic-адаптер** (`server/providers/anthropic.js`):
```js
// поля config: apiKey, model (claude-3-5-sonnet-20241022 и т.д.)
// endpoint: https://api.anthropic.com/v1/messages
// особенность: другая структура запроса (system отдельно)
```

**Ollama-адаптер** (`server/providers/ollama.js`):
```js
// поля config: baseURL (http://localhost:11434), model
// OpenAI-compatible /v1/chat/completions
// apiKey не нужен
```

**OpenRouter-адаптер** (`server/providers/openrouter.js`):
```js
// поля config: apiKey, model (например google/gemini-pro)
// baseURL: https://openrouter.ai/api/v1
// дополнительный заголовок: HTTP-Referer
```

**Custom-адаптер** (`server/providers/custom.js`):
```js
// поля config: baseURL, apiKey (опц.), model
// любой OpenAI-compatible API (LM Studio, vLLM, Together AI, Groq...)
```

#### 1.3 Provider Manager

```js
// server/providerManager.js
class ProviderManager {
  register(id, AdapterClass)  // регистрация нового типа
  create(type, config)        // создать экземпляр провайдера
  list()                      // список зарегистрированных типов
  save(id, config)            // сохранить настройки в config/providers.json
  load()                      // загрузить сохранённые настройки
  getActive()                 // вернуть текущий активный провайдер
  setActive(id)               // переключить активный провайдер
}
```

---

### Этап 2 — Modrinth API Client (1 час)

**Цель:** чистая обёртка над `https://api.modrinth.com/v2`.

#### 2.1 Методы клиента

```js
// server/modrinth/client.js
class ModrinthClient {
  // Основной поиск
  async search({ query, facets, index, limit, offset }) {}
  
  // Получение тегов (категории, лоадеры, версии MC)
  async getCategories() {}
  async getLoaders() {}
  async getGameVersions() {}
  
  // Детали проекта
  async getProject(slugOrId) {}
}
```

#### 2.2 Фасеты Modrinth API

Modrinth использует `facets` для фильтрации. Пример:
```
facets=[["project_type:modpack"],["categories:fabric"],["versions:1.20.1"]]
```

Хелпер `facets.js` будет строить массив фасетов из объекта, который возвращает AI:
```js
buildFacets({ projectType, loaders, versions, categories })
// → '[["project_type:modpack"],["categories:fabric"],["versions:1.20.1"]]'
```

---

### Этап 3 — AI Orchestrator (2 часа)

**Главная логика приложения.** Три фазы обработки каждого запроса:

#### Фаза 1: Разбор промпта → параметры поиска

AI получает пользовательский запрос + список доступных тегов Modrinth и возвращает JSON:
```json
{
  "searchQuery": "magic technology progression",
  "filters": {
    "projectType": "modpack",
    "loaders": ["fabric"],
    "versions": ["1.20.1"],
    "categories": ["magic", "technology"]
  },
  "sortBy": "relevance",
  "reasoning": "Пользователь хочет баланс магии и технологий, Fabric 1.20.1"
}
```

Системный промпт для этой фазы (в `server/prompts.js`):
```
Ты — помощник по поиску модпаков Minecraft на платформе Modrinth.
Пользователь описывает что хочет на естественном языке.
Твоя задача — извлечь параметры поиска и вернуть ТОЛЬКО валидный JSON.

Доступные лоадеры: {loaders}
Доступные версии MC: {versions}  
Доступные категории: {categories}

Верни JSON строго по схеме:
{ "searchQuery": string, "filters": {...}, "sortBy": string, "reasoning": string }
```

#### Фаза 2: Запрос к Modrinth API

Используем параметры из Фазы 1 → `ModrinthClient.search()` → до 20 результатов.

#### Фаза 3: Ранжирование и объяснение

AI получает результаты Modrinth и оригинальный запрос, возвращает:
- Топ-5 (или меньше) рекомендаций в порядке релевантности
- Краткое объяснение почему каждый подходит
- Предупреждения (например, «нашлось мало результатов, попробуй расширить запрос»)

---

### Этап 4 — REST API Backend (1 час)

#### Эндпоинты

```
POST /api/search
  Body: { prompt: string }
  Response: { results: [...], explanation: string, searchParams: {...} }

GET /api/providers
  Response: { types: [...], saved: [...], active: string }

POST /api/providers
  Body: { id: string, type: string, config: {...} }
  Response: { ok: boolean }

POST /api/providers/test
  Body: { type: string, config: {...} }
  Response: { ok: boolean, error?: string, latency?: number }

PUT /api/providers/active
  Body: { id: string }
  Response: { ok: boolean }

DELETE /api/providers/:id
  Response: { ok: boolean }

GET /api/tags
  Response: { loaders: [...], versions: [...], categories: [...] }
```

#### Обработка ошибок

Единый формат ошибки:
```json
{ "error": "описание", "code": "PROVIDER_ERROR | MODRINTH_ERROR | PARSE_ERROR" }
```

---

### Этап 5 — Веб-интерфейс (3 часа)

**Дизайн:** тёмная тема в стиле Modrinth (зелёный акцент `#1bd96a`), минималистичный.

#### 5.1 Layout (один HTML-файл)

```
┌─────────────────────────────────────────────────────┐
│  🎮 ModrinthAI Search          [⚙ Настройки AI]     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Опиши какой модпак ищешь...                  │  │
│  │                                          [→]  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  💬 AI: Ищу модпаки с магией и технологиями        │
│         на Fabric 1.20.1...                        │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ [Иконка] │ │ [Иконка] │ │ [Иконка] │           │
│  │ Название │ │ Название │ │ Название │           │
│  │ ★★★★☆   │ │ ★★★★★   │ │ ★★★☆☆   │           │
│  │ ↓ 120k  │ │ ↓ 89k   │ │ ↓ 45k   │           │
│  │ Почему? │ │ Почему? │ │ Почему? │           │
│  │[Открыть]│ │[Открыть]│ │[Открыть]│           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 5.2 Панель настроек провайдера (боковое модальное окно)

```
┌──────────────────────────────┐
│  Настройки AI-провайдера  ✕  │
├──────────────────────────────┤
│  Тип провайдера:             │
│  [OpenAI ▼]                  │
│                              │
│  Поля (динамические по типу):│
│  API Key: [••••••••••]       │
│  Model:   [gpt-4o-mini ▼]   │
│  Base URL: [необязательно]   │
│                              │
│  [Проверить соединение]      │
│  ✅ Работает (231ms)         │
│                              │
│  [Сохранить] [Отмена]        │
└──────────────────────────────┘
```

Поля формы меняются в зависимости от выбранного типа провайдера (без перезагрузки страницы).

#### 5.3 Карточка модпака

- Иконка модпака (от Modrinth API)
- Название + короткое описание
- Теги: лоадер, версия MC, категории
- Счётчики: загрузки, подписчики
- **Объяснение от AI** — почему подходит под запрос
- Кнопка «Открыть на Modrinth» (в новой вкладке)

#### 5.4 UX-детали

- Стриминг ответа AI (Server-Sent Events или polling) — пользователь видит процесс
- Skeleton-загрузка карточек
- История последних 10 поисков (localStorage)
- Пустое состояние с примерами запросов
- Мобильная адаптивность

---

### Этап 6 — Конфигурация и запуск (0.5 часа)

#### `.env.example`
```env
PORT=3000

# Активный провайдер по умолчанию (опционально)
DEFAULT_PROVIDER_TYPE=openai
DEFAULT_PROVIDER_API_KEY=
DEFAULT_PROVIDER_MODEL=gpt-4o-mini

# Или Anthropic
# DEFAULT_PROVIDER_TYPE=anthropic
# DEFAULT_PROVIDER_API_KEY=sk-ant-...
# DEFAULT_PROVIDER_MODEL=claude-3-5-haiku-20241022

# Или Ollama (без ключа)
# DEFAULT_PROVIDER_TYPE=ollama
# DEFAULT_PROVIDER_BASE_URL=http://localhost:11434
# DEFAULT_PROVIDER_MODEL=llama3.2

# Или любой OpenAI-compatible
# DEFAULT_PROVIDER_TYPE=custom
# DEFAULT_PROVIDER_BASE_URL=https://api.groq.com/openai/v1
# DEFAULT_PROVIDER_API_KEY=gsk_...
# DEFAULT_PROVIDER_MODEL=llama-3.1-8b-instant
```

#### `package.json` скрипты
```json
{
  "scripts": {
    "start": "node server/index.js",
    "dev": "nodemon server/index.js",
    "lint": "eslint server/ public/"
  }
}
```

---

### Этап 7 — Тестирование (1 час)

#### Тест-сценарии

| Запрос | Ожидаемый результат |
|--------|---------------------|
| «Хочу хардкорный технологический модпак» | фасет `technology`, высокая сложность |
| «Что-нибудь с магией для новичка» | фасет `magic`, beginner-friendly |
| «Модпак как RLCraft но легче» | похожий стиль survival |
| «1.7.10 с индастриалкрафтом» | фильтр по версии 1.7.10 |
| «хочу играть с другом» | фасет `multiplayer` |

#### Проверка провайдеров

- [ ] OpenAI gpt-4o-mini
- [ ] Anthropic claude-haiku
- [ ] Ollama llama3.2 (локальный)
- [ ] OpenRouter (бесплатная модель)
- [ ] Custom endpoint (Groq или LM Studio)

---

## Временные оценки

| Этап | Время |
|------|-------|
| 0. Настройка | 0.5 ч |
| 1. Провайдер-система | 2 ч |
| 2. Modrinth Client | 1 ч |
| 3. AI Orchestrator | 2 ч |
| 4. REST API | 1 ч |
| 5. Веб-интерфейс | 3 ч |
| 6. Конфиг и запуск | 0.5 ч |
| 7. Тестирование | 1 ч |
| **Итого** | **~11 часов** |

---

## Возможные расширения (после MVP)

- **Сохранение избранного** — список модпаков в localStorage или backend БД
- **Сравнение модпаков** — AI сравнивает 2-3 выбранных
- **Фильтры вручную** — дополнительные слайдеры (версия, лоадер) поверх AI-поиска
- **Экспорт** — скопировать список результатов в Markdown
- **Мультиязычность** — промпт на любом языке (AI сам переводит для поиска)
- **Webhooks** — уведомление когда выходит обновление найденного модпака
- **Docker-compose** — одна команда для запуска с Ollama

---

## Требования для запуска

- Node.js 18+
- npm или yarn
- Доступ к интернету (для Modrinth API)
- API-ключ любого LLM-провайдера **или** локальный Ollama

```bash
# Установка и запуск
git clone <repo>
cd modrinth-ai-search
npm install
cp .env.example .env
# Заполнить .env своими ключами
npm run dev
# Открыть http://localhost:3000
```
