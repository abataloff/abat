# CLAUDE.md

## Обзор проекта

ABAT - пошаговая стратегия на гексагональной карте. Vanilla TypeScript + Canvas (фронтенд), Node.js + SQLite (бэкенд). Без фреймворков (React/Vue).

## Стек

- **Frontend:** TypeScript, Canvas API, Vite 7
- **Backend:** Node.js, custom HTTP router, WebSocket (ws), SQLite (better-sqlite3)
- **Авторизация:** JWT + Google OAuth
- **БД:** SQLite (файл: `data/abat.db`)
- **Деплой:** Docker, GitHub Actions -> ghcr.io, Selectel VDS

## Команды

Порты настраиваются через `.env` (файл в .gitignore):
```
PORT=8051         # Backend
VITE_PORT=8050    # Vite dev сервер
```

```bash
# Разработка (нужны оба процесса)
npm run dev              # Vite dev сервер (VITE_PORT, default 8050)
npm run dev:server       # Backend сервер (PORT, default 8051)

# Остановка (порт из .env)
lsof -i :$PORT -t | xargs kill      # Остановить backend
lsof -i :$VITE_PORT -t | xargs kill # Остановить Vite

# Перезапуск backend
lsof -i :$PORT -t | xargs kill 2>/dev/null; npm run dev:server

# Сборка
npm run build            # Frontend (tsc + vite build -> dist/)
npm run build:server     # Backend (tsc -> dist-server/)
npm run build:all        # Все вместе

# Production
npm start                # node dist-server/server/prod.js (порт 8051)

# Тесты
npm test                 # Vitest (unit тесты)
npm run test:watch       # Vitest в watch-режиме
```

## Скриншоты

Все скриншоты Playwright сохранять в папку `screenshots/` (в .gitignore):
```js
browser_take_screenshot({ filename: "screenshots/my-check.png" })
```

## Правила

- Весь UI-текст на русском. Идентификаторы в коде на английском.
- Canvas input: всегда обрабатывать и click, и touchend (Safari compatibility).
- Серверные HTML-страницы (`/admin`, `/feedback`, `/my-games`) стилизованы в стиле игры (Chakra Petch, темная тема, grid-фон).
- Порты брать из переменных окружения со значением по умолчанию.
