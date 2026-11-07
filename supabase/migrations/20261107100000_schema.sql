-- =============================================================================
-- 1/3. Структура данных: сотрудники, объекты, задачи, история статусов.
--
-- Здесь только таблицы и проверки целостности данных.
-- Права доступа (RLS, GRANT) — в 20261107100100_access_control.sql.
-- Жизненный цикл задачи (переходы статусов, история) — в 20261107100200_task_workflow.sql.
-- =============================================================================

-- Служебная схема для внутренних функций и таблиц.
-- Она НЕ публикуется через API (в config.toml / Dashboard открыты только public и graphql_public),
-- поэтому вызвать эти функции или прочитать эти таблицы через REST нельзя.
create schema private;
comment on schema private is 'Внутренние функции и таблицы приложения; через API не публикуется';
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- Типы
-- -----------------------------------------------------------------------------

-- Роль сотрудника в приложении (не путать с ролями Postgres anon/authenticated).
-- Хранится в public.profiles, а не в user_metadata: user_metadata пользователь
-- может изменить сам через supabase.auth.updateUser(), а profiles — нет.
create type public.user_role as enum (
  'manager',  -- постановщик
  'executor'  -- исполнитель
);

create type public.task_status as enum (
  'new',          -- Новая
  'in_progress',  -- В работе
  'review',       -- На проверке
  'accepted',     -- Принята
  'rework'        -- На доработке
);

-- -----------------------------------------------------------------------------
-- Таблицы
-- -----------------------------------------------------------------------------

-- Профиль сотрудника, 1:1 с auth.users. Заводит администратор (см. README):
-- у пользователей нет прав создавать или менять профили, в том числе свою роль.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (char_length(btrim(full_name)) between 1 and 200),
  role       public.user_role not null,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Сотрудники и их роли: постановщик (manager) или исполнитель (executor)';

-- Объект — стройка.
create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 200),
  address    text not null check (char_length(btrim(address)) between 1 and 500),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Удаление — это пометка (soft delete): объект пропадает из приложения и API,
  -- но остаётся в базе вместе с задачами и их историей.
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id)
);
comment on table public.objects is 'Объекты (стройки)';

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  object_id   uuid not null references public.objects (id),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  assignee_id uuid not null references public.profiles (id),
  status      public.task_status not null default 'new',
  author_id   uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references public.profiles (id)
);
comment on table public.tasks is 'Задачи по объектам';

create index tasks_object_id_idx on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

-- Журнал смен статуса. Пишется только функциями базы (см. 3/3), только добавлением.
-- Внешний ключ без ON DELETE CASCADE: задачу с историей физически удалить нельзя.
create table public.task_status_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id),
  from_status public.task_status,  -- null — запись о создании задачи
  to_status   public.task_status not null,
  changed_by  uuid not null references public.profiles (id),
  comment     text check (char_length(comment) between 1 and 2000),
  created_at  timestamptz not null default now()
);
comment on table public.task_status_history is 'История статусов задач: кто, когда, откуда, куда, комментарий';

create index task_status_history_task_id_idx on public.task_status_history (task_id, id);

-- -----------------------------------------------------------------------------
-- Триггеры целостности данных
-- -----------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger objects_set_updated_at
  before update on public.objects
  for each row execute function private.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function private.set_updated_at();

-- Проверки задачи, которые нельзя выразить внешним ключом:
--   * задача создаётся только в статусе «Новая»;
--   * исполнитель — сотрудник с ролью «Исполнитель» (не постановщик и не случайный uuid);
--   * объект существует и не удалён.
-- security definer: проверка не должна зависеть от того, что видит вызывающий.
create function private.tasks_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status <> 'new' then
    raise exception 'Задача создаётся только в статусе «Новая»';
  end if;

  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    if not exists (
      select 1 from public.profiles p
      where p.id = new.assignee_id and p.role = 'executor'
    ) then
      raise exception 'Исполнителем можно назначить только сотрудника с ролью «Исполнитель»';
    end if;
  end if;

  if tg_op = 'INSERT' or new.object_id is distinct from old.object_id then
    if not exists (
      select 1 from public.objects o
      where o.id = new.object_id and o.deleted_at is null
    ) then
      raise exception 'Объект не найден или удалён';
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_validate
  before insert or update on public.tasks
  for each row execute function private.tasks_validate();
