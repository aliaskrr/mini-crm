# Мини-CRM «Объекты и задачи»

Тестовое задание: CRM для строительной компании. Постановщик ставит задачи по объектам (стройкам), исполнитель берёт их в работу и отдаёт на проверку, постановщик принимает или возвращает на доработку. Все права доступа и переходы статусов проверяет сама база данных, поэтому они работают и при обращении к Supabase в обход интерфейса.

**Стек:** React 19 + TypeScript, Vite, Ant Design, TanStack Query, React Router · Supabase (Postgres, Auth, PostgREST).

**Документы для сдачи:**
- [Как устроена система — объяснение для руководителя](docs/EXPLANATION.md)
- [Решения и допущения, что не вошло](docs/DECISIONS.md)

| Постановщик: задача на проверке | Исполнитель: задача вернулась на доработку |
|---|---|
| ![Карточка задачи у постановщика](docs/screenshots/manager-task-review.png) | ![Карточка задачи у исполнителя](docs/screenshots/executor-task-rework.png) |
| **Постановщик: все объекты** | **Исполнитель: только свои задачи** |
| ![Список объектов](docs/screenshots/manager-objects.png) | ![Мои задачи](docs/screenshots/executor-tasks.png) |

## Как защищены данные

| Требование | Как сделано |
|---|---|
| Права закрыты на уровне базы | RLS на всех таблицах и `GRANT` по отдельным колонкам. Роль `anon` (запрос без входа) не получает ничего. |
| Исполнитель не читает и не меняет чужие задачи | Политика `tasks_select` отдаёт исполнителю только строки с `assignee_id = auth.uid()`. Менять поля задач может только постановщик. Объекты, историю и профили исполнитель видит только в рамках своих задач. |
| Переходы статусов проверяет база | Единственный путь — функция `change_task_status()`. Она проверяет матрицу `private.task_transitions`, роль и назначение, обязательный комментарий и в той же транзакции пишет историю. Прямой `UPDATE` колонки `status` запрещён правами и триггером, даже для `service_role`. |
| Историю нельзя подделать, изменить или удалить | Пишут в неё только функции базы. Права `INSERT/UPDATE/DELETE` нет ни у кого, включая `service_role`. Триггер запрещает `UPDATE/DELETE/TRUNCATE` даже владельцу таблицы. Удаление задачи — пометка, история остаётся. |
| Открытая регистрация отключена | Локально — `enable_signup = false` в `supabase/config.toml`, в облаке — настройка в Dashboard (см. ниже). Пользователь без профиля с ролью не видит ничего. |
| Секретные ключи не во фронтенде и не в репозитории | Во фронтенд попадают только URL и publishable-ключ (`VITE_*`). Секретный ключ нужен только локальному скрипту сида и берётся из переменной окружения. `.env*` в `.gitignore`. Фронтенд не стартует, если в него по ошибке подставили секретный ключ. |

Код: [`supabase/migrations/`](supabase/migrations) — три файла: структура, права, жизненный цикл задачи.

**Проверки:**
- `npm run db:test` — 79 тестов pgTAP прямо в базе от имени разных ролей.
- `npm run test:api` — 27 попыток обойти правила через HTTP API с публичным ключом. Все должны быть отклонены.

## Запуск локально

Нужны Node.js 22.12+ и Docker.

```bash
npm install
```

```bash
npx supabase start
```

Поднимает локальный Supabase (Postgres, Auth, API) и применяет миграции. Затем покажите ключи:

```bash
npx supabase status
```

Скопируйте `.env.example` в `.env.local` и заполните: `VITE_SUPABASE_URL` (API URL), `VITE_SUPABASE_PUBLISHABLE_KEY` (Publishable key), `SUPABASE_SECRET_KEY` (Secret key, только для сида) и `SEED_PASSWORD` (любой пароль от 8 символов, с буквами и цифрами).

```bash
npm run seed
```

Создаёт сотрудников, 3 объекта и задачи во всех статусах.

```bash
npm run dev
```

Приложение откроется на http://localhost:5173.

Тесты (на свежих данных: `npx supabase db reset`, затем `npm run seed`):

```bash
npm run db:test
```

```bash
npm run test:api
```

## Развёртывание: Supabase Cloud + Vercel

1. Создайте проект на [supabase.com](https://supabase.com) (бесплатного тарифа достаточно).
2. Примените миграции:
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref <project-ref>
   ```
   ```bash
   npx supabase db push
   ```
   Или выполните по порядку три файла из `supabase/migrations/` в SQL Editor.
3. Отключите регистрацию: Authentication → Sign In / Providers → **Allow new users to sign up** → выключить.
4. Создайте сотрудников и демо-данные. Секретный ключ передаётся только в командной строке и в файлах проекта не сохраняется:
   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key> SUPABASE_SECRET_KEY=<secret key> SEED_PASSWORD='<пароль>' npm run seed
   ```
   Ключи лежат в Project Settings → API Keys. Legacy anon и service_role ключи тоже подходят.
5. Vercel → Add New Project → импорт репозитория → Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` → Deploy. Настройки SPA уже в `vercel.json`. Netlify тоже подойдёт — для него есть `public/_redirects`.

Добавить сотрудника вручную: Dashboard → Authentication → Users → Add user (email, пароль, Auto Confirm User), затем в SQL Editor:

```sql
insert into public.profiles (id, full_name, role)
select id, 'Иван Иванов', 'executor'   -- или 'manager'
from auth.users
where email = 'ivanov@example.com';
```

## Демо-доступы

После `npm run seed`. Пароль у всех — значение `SEED_PASSWORD`.

| Роль | Сотрудник | Email |
|---|---|---|
| Постановщик | Анна Смирнова | manager@example.com |
| Постановщик | Олег Кузнецов | chief@example.com |
| Исполнитель | Иван Иванов | ivanov@example.com |
| Исполнитель | Пётр Петров | petrov@example.com |

У Иванова задачи на двух объектах из трёх: третий объект ему не виден.

## Структура

```
supabase/
  migrations/
    …_schema.sql            таблицы, ограничения, проверка исполнителя
    …_access_control.sql    GRANT + RLS-политики
    …_task_workflow.sql     матрица переходов, change_task_status(), история, удаление
  tests/database/security.test.sql   pgTAP-тесты
  config.toml               локальный стек (регистрация выключена)
scripts/
  seed.ts                   демо-данные через настоящий API
  api-security-check.ts     попытки обхода правил через HTTP API
src/
  api/                      запросы к Supabase (TanStack Query)
  auth/                     сессия, профиль, защита маршрутов
  components/               таблицы, формы, кнопки действий, история
  pages/                    экраны: вход, объекты, объект, задачи, задача
  lib/                      клиент Supabase, типы БД (supabase gen types), подписи статусов
```
