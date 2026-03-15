# Alien Signal Classifier 2226

MVP веб-приложение для классификации инопланетных радиосигналов с помощью нейросети.

---

## Содержание

- [Архитектура](#архитектура)
- [Требования](#требования)
- [Установка и запуск](#установка-и-запуск)
- [API](#api)
- [Формат данных](#формат-данных)
- [Технологии](#технологии)

---

## Архитектура

```
МПОШ_кейс/
├── ml_pipeline.py          # Обучение ML-модели
├── model.h5                # Обученная модель (генерируется)
├── classes.json            # Маппинг классов (генерируется)
├── training_history.json   # История обучения (генерируется)
├── stats.json              # Статистика данных (генерируется)
├── train_valid.npz         # Данные для обучения
│
├── backend/
│   ├── main.py             # FastAPI-приложение
│   ├── database.py         # Подключение к Supabase
│   ├── schemas.py          # Pydantic-модели
│   ├── auth.py             # JWT-авторизация
│   ├── test_main.py        # Тесты
│   └── requirements.txt    # Зависимости Python
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── App.tsx
│       ├── api.ts
│       ├── types.ts
│       └── pages/
│           ├── LoginPage.tsx
│           ├── AdminPage.tsx
│           └── DashboardPage.tsx
│
└── supabase_setup.sql      # SQL для создания таблицы users
```

---

## Требования

- Python 3.x
- Node.js и npm
- Аккаунт Supabase (для backend)

---

## Установка и запуск

### 1. Supabase (выполнить первым)

В **Supabase Dashboard** → **SQL Editor** выполнить скрипт из `supabase_setup.sql` или вручную:

- Создать таблицу `users` (см. `supabase_setup.sql`).
- Указать в `backend/database.py` корректные `SUPABASE_URL` и `SUPABASE_KEY`.

### 2. ML Pipeline (обучение модели)

```bash
pip install tensorflow numpy librosa scikit-learn
# Положить train_valid.npz в корень проекта (или использовать демо-данные)
python ml_pipeline.py
```

Создаются файлы: `model.h5`, `classes.json`, `training_history.json`, `stats.json`.

### 3. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Сервер: http://localhost:8000  
Документация API: http://localhost:8000/docs

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Интерфейс: http://localhost:3000

### Параллельный запуск

**Терминал 1 (backend):**
```bash
cd backend && uvicorn main:app --reload --port 8000
```

**Терминал 2 (frontend):**
```bash
cd frontend && npm run dev
```

---

## Тестирование

```bash
cd backend
pytest test_main.py -v
```

Ручная проверка: вход `admin` / `admin`, создание пользователя в Admin Panel, загрузка `test.npz` в Dashboard.

---

## API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/login` | Авторизация |
| GET | `/api/me` | Текущий пользователь |
| POST | `/api/users` | Создание пользователя (admin) |
| GET | `/api/users` | Список пользователей (admin) |
| GET | `/api/analytics/training` | История обучения |
| GET | `/api/analytics/stats` | Статистика данных |
| POST | `/api/predict` | Классификация сигналов |

---

## Формат данных

**train_valid.npz:**
- `train_x`, `train_y` — обучающие данные и метки
- `valid_x`, `valid_y` — валидационные данные и метки

**test.npz:**
- `test_x`, `test_y` — тестовые данные и метки

Массивы — амплитуды аудио; метки — названия классов (например, `kepler-62f`, `gliese_163_c`).

---

## Технологии

- **ML:** TensorFlow/Keras, librosa (MFCC), scikit-learn
- **Backend:** FastAPI, Supabase, JWT, Pydantic
- **Frontend:** React, TypeScript, Vite, TailwindCSS, Recharts

---

## Авторы

ЧЧЧ Team
