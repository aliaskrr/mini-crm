-- =============================================================================
-- 2/3. Права доступа.
--
-- Защита в два слоя, оба внутри Postgres, поэтому работают при любом способе
-- обращения к Supabase (наш интерфейс, curl, supabase-js из консоли браузера, GraphQL):
--
--   1) GRANT — какие таблицы и КОЛОНКИ роль authenticated вообще может читать/менять.
--      Колонки status, author_id, created_at, deleted_* напрямую не меняет никто:
--      статус меняется только функцией change_task_status() (см. 3/3).
--   2) RLS (row level security) — какие СТРОКИ видит и меняет конкретный пользователь.
--
-- Роль anon (запросы без входа) не получает ничего.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Вспомогательная функция для политик
-- -----------------------------------------------------------------------------

-- Является ли текущий пользователь постановщиком.
-- security definer — чтобы читать profiles в обход RLS и не уйти в рекурсию политик.
create function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'manager'
  );
$$;

-- -----------------------------------------------------------------------------
-- GRANT: таблицы и колонки
-- -----------------------------------------------------------------------------

-- Supabase по умолчанию выдаёт anon/authenticated все права на новые таблицы в public.
-- Забираем всё и выдаём ровно то, что нужно приложению.
revoke all on table
  public.profiles,
  public.objects,
  public.tasks,
  public.task_status_history
from anon, authenticated;

revoke all on sequence public.task_status_history_id_seq from anon, authenticated;

-- Профили: только чтение. Роль и ФИО меняет администратор.
grant select on table public.profiles to authenticated;

-- Объекты: читать; создавать и править только название и адрес.
-- Удаление — функцией delete_object() (пометка, а не физическое удаление).
grant select on table public.objects to authenticated;
grant insert (name, address), update (name, address) on table public.objects to authenticated;

-- Задачи: читать; создавать и править только «содержательные» поля.
-- status, author_id, created_at задаются базой и не могут прийти от клиента.
grant select on table public.tasks to authenticated;
grant insert (object_id, title, description, assignee_id),
      update (object_id, title, description, assignee_id)
  on table public.tasks to authenticated;

-- История: только чтение. Пишут в неё только функции базы.
grant select on table public.task_status_history to authenticated;

-- Даже админский ключ service_role не может дописать, изменить или удалить историю через API.
revoke insert, update, delete, truncate on table public.task_status_history from service_role;

-- -----------------------------------------------------------------------------
-- RLS: строки
-- -----------------------------------------------------------------------------
-- Функции в политиках обёрнуты в (select ...), чтобы Postgres вычислял их
-- один раз на запрос, а не для каждой строки.

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_status_history enable row level security;

-- ---- profiles ---------------------------------------------------------------
-- Постановщик видит всех (нужно, чтобы назначать исполнителей).
-- Исполнитель видит себя и постановщиков (авторов задач), но не других исполнителей.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or role = 'manager'
    or (select private.is_manager())
  );

-- ---- objects ----------------------------------------------------------------
-- Постановщик видит все объекты; исполнитель — только те, где у него есть задачи.
create policy objects_select on public.objects
  for select to authenticated
  using (
    deleted_at is null
    and (
      (select private.is_manager())
      or exists (
        select 1
        from public.tasks t
        where t.object_id = objects.id
          and t.assignee_id = (select auth.uid())
          and t.deleted_at is null
      )
    )
  );

create policy objects_insert on public.objects
  for insert to authenticated
  with check (
    (select private.is_manager())
    and created_by = (select auth.uid())
  );

create policy objects_update on public.objects
  for update to authenticated
  using (deleted_at is null and (select private.is_manager()))
  with check ((select private.is_manager()));

-- DELETE-политики нет: физически удалить объект через API нельзя никому.

-- ---- tasks ------------------------------------------------------------------
-- Постановщик видит все задачи; исполнитель — только назначенные ему.
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and (
      (select private.is_manager())
      or assignee_id = (select auth.uid())
    )
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    (select private.is_manager())
    and author_id = (select auth.uid())
  );

-- Править поля задачи может только постановщик. Исполнитель меняет только статус
-- и только через change_task_status().
create policy tasks_update on public.tasks
  for update to authenticated
  using (deleted_at is null and (select private.is_manager()))
  with check ((select private.is_manager()));

-- DELETE-политики нет: удаление — функцией delete_task() (пометка).

-- ---- task_status_history ----------------------------------------------------
-- Историю видит тот, кто видит саму задачу. Политик на INSERT/UPDATE/DELETE нет.
create policy task_status_history_select on public.task_status_history
  for select to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_status_history.task_id
        and t.deleted_at is null
        and (
          (select private.is_manager())
          or t.assignee_id = (select auth.uid())
        )
    )
  );
