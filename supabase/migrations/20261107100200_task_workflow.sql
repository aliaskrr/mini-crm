-- =============================================================================
-- 3/3. Жизненный цикл задачи: переходы статусов, история, удаление.
--
-- Единственный способ сменить статус — функция public.change_task_status().
-- Она проверяет матрицу переходов, роль и назначение, обязательный комментарий,
-- меняет статус и пишет историю в одной транзакции.
-- Прямой UPDATE колонки status запрещён правами (2/3) и триггером (ниже).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Матрица переходов — единственный источник правды «кто и куда может перевести задачу»
-- -----------------------------------------------------------------------------

create type private.transition_actor as enum (
  'manager',  -- любой постановщик
  'assignee'  -- исполнитель, назначенный на эту задачу
);

create table private.task_transitions (
  from_status      public.task_status not null,
  to_status        public.task_status not null,
  actor            private.transition_actor not null,
  comment_required boolean not null default false,
  primary key (from_status, to_status)
);
comment on table private.task_transitions is
  'Разрешённые переходы статусов. Всё, чего здесь нет, запрещено. Создание задачи (— → new) — отдельно, при INSERT';

insert into private.task_transitions (from_status, to_status, actor, comment_required) values
  ('new',         'in_progress', 'assignee', false),  -- взять в работу
  ('in_progress', 'review',      'assignee', false),  -- отправить на проверку
  ('review',      'accepted',    'manager',  false),  -- принять
  ('review',      'rework',      'manager',  true),   -- вернуть на доработку (с комментарием)
  ('rework',      'in_progress', 'assignee', false);  -- снова взять в работу

revoke all on table private.task_transitions from public;

create function private.status_label(p_status public.task_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'new'         then 'Новая'
    when 'in_progress' then 'В работе'
    when 'review'      then 'На проверке'
    when 'accepted'    then 'Принята'
    when 'rework'      then 'На доработке'
  end;
$$;

-- Переходы, доступные ТЕКУЩЕМУ пользователю для задачи в её текущем статусе.
-- Используется и для проверки (change_task_status), и для кнопок в интерфейсе
-- (get_available_transitions), поэтому интерфейс не может «разойтись» с базой.
create function private.allowed_transitions(p_task public.tasks)
returns setof private.task_transitions
language sql
stable
security definer
set search_path = ''
as $$
  select tr.*
  from private.task_transitions tr
  where tr.from_status = p_task.status
    and case tr.actor
          when 'manager'  then private.is_manager()
          when 'assignee' then p_task.assignee_id = (select auth.uid())
        end;
$$;

-- -----------------------------------------------------------------------------
-- Защитные триггеры
-- -----------------------------------------------------------------------------

-- Статус меняется только внутри change_task_status(). Это второй рубеж после GRANT:
-- он срабатывает для любой роли, включая service_role и администратора в SQL-редакторе.
create function private.tasks_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.task_status_change', true), '') <> 'on'
  then
    raise exception 'Статус задачи меняется только через change_task_status()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tasks_guard_status
  before update of status on public.tasks
  for each row execute function private.tasks_guard_status();

-- Запись о создании задачи (— → «Новая»).
create function private.tasks_log_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_status_history (task_id, from_status, to_status, changed_by)
  values (new.id, null, new.status, new.author_id);
  return null;
end;
$$;

create trigger tasks_log_creation
  after insert on public.tasks
  for each row execute function private.tasks_log_creation();

-- История только дописывается: UPDATE, DELETE и TRUNCATE запрещены всем,
-- включая владельца таблицы (обойти можно только явным отключением триггера — это DDL,
-- через API недоступно).
create function private.forbid_history_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'История статусов неизменяема (операция % запрещена)', tg_op
    using errcode = '42501';
end;
$$;

create trigger task_status_history_no_update_delete
  before update or delete on public.task_status_history
  for each row execute function private.forbid_history_changes();

create trigger task_status_history_no_truncate
  before truncate on public.task_status_history
  for each statement execute function private.forbid_history_changes();

-- -----------------------------------------------------------------------------
-- API (RPC): то, что вызывает фронтенд через supabase.rpc(...)
-- -----------------------------------------------------------------------------

-- Какие кнопки показать в карточке задачи.
-- security invoker: задача читается с RLS вызывающего, для чужой задачи — пустой список.
create function public.get_available_transitions(p_task_id uuid)
returns table (to_status public.task_status, comment_required boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select tr.to_status, tr.comment_required
  from public.tasks t
  cross join lateral private.allowed_transitions(t) tr
  where t.id = p_task_id;
$$;

-- Смена статуса задачи.
create function public.change_task_status(
  p_task_id   uuid,
  p_to_status public.task_status,
  p_comment   text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_comment text := nullif(btrim(p_comment), '');
  v_task    public.tasks;
  v_rule    private.task_transitions;
begin
  if v_user_id is null then
    raise exception 'Нужно войти в систему' using errcode = '42501';
  end if;

  -- FOR UPDATE блокирует строку до конца транзакции: два одновременных запроса
  -- не смогут оба пройти проверку по одному и тому же старому статусу.
  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  -- Те же правила видимости, что в RLS: чужая или удалённая задача для пользователя
  -- «не существует» — не раскрываем даже сам факт её наличия.
  if not found
     or v_task.deleted_at is not null
     or not (private.is_manager() or v_task.assignee_id = v_user_id)
  then
    raise exception 'Задача не найдена' using errcode = 'PT404';
  end if;

  select * into v_rule
  from private.task_transitions
  where from_status = v_task.status
    and to_status = p_to_status;

  if not found then
    raise exception 'Переход «%» → «%» запрещён',
      private.status_label(v_task.status), private.status_label(p_to_status);
  end if;

  if not exists (
    select 1 from private.allowed_transitions(v_task) a where a.to_status = p_to_status
  ) then
    raise exception '%',
      case v_rule.actor
        when 'manager' then 'Это действие доступно только постановщику'
        else 'Это действие доступно только исполнителю, назначенному на задачу'
      end
      using errcode = '42501';
  end if;

  if v_rule.comment_required and v_comment is null then
    raise exception 'Для перевода в статус «%» нужен комментарий',
      private.status_label(p_to_status);
  end if;

  -- Разрешаем смену статуса только на время этого UPDATE (см. tasks_guard_status).
  perform set_config('app.task_status_change', 'on', true);
  update public.tasks
     set status = p_to_status
   where id = p_task_id
  returning * into v_task;
  perform set_config('app.task_status_change', 'off', true);

  insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment)
  values (v_task.id, v_rule.from_status, v_task.status, v_user_id, v_comment);

  return v_task;
end;
$$;

-- Удаление задачи постановщиком: пометка deleted_at, история сохраняется.
create function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_manager() then
    raise exception 'Удалять задачи может только постановщик' using errcode = '42501';
  end if;

  update public.tasks
     set deleted_at = now(),
         deleted_by = (select auth.uid())
   where id = p_task_id
     and deleted_at is null;

  if not found then
    raise exception 'Задача не найдена' using errcode = 'PT404';
  end if;
end;
$$;

-- Удаление объекта постановщиком: помечаются объект и все его задачи.
create function public.delete_object(p_object_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_manager() then
    raise exception 'Удалять объекты может только постановщик' using errcode = '42501';
  end if;

  update public.objects
     set deleted_at = now(),
         deleted_by = (select auth.uid())
   where id = p_object_id
     and deleted_at is null;

  if not found then
    raise exception 'Объект не найден' using errcode = 'PT404';
  end if;

  update public.tasks
     set deleted_at = now(),
         deleted_by = (select auth.uid())
   where object_id = p_object_id
     and deleted_at is null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Права на функции
-- -----------------------------------------------------------------------------
-- По умолчанию EXECUTE на новые функции есть у PUBLIC, а в Supabase ещё и у anon.

revoke all on all functions in schema private from public;

-- Нужны роли authenticated для вычисления RLS-политик и get_available_transitions().
-- Вызвать их напрямую через API нельзя: схема private не опубликована.
grant usage on schema private to authenticated;
grant execute on function private.is_manager() to authenticated;
grant execute on function private.allowed_transitions(public.tasks) to authenticated;

revoke all on function public.get_available_transitions(uuid) from public, anon;
revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon;
revoke all on function public.delete_task(uuid) from public, anon;
revoke all on function public.delete_object(uuid) from public, anon;

grant execute on function public.get_available_transitions(uuid) to authenticated;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
grant execute on function public.delete_task(uuid) to authenticated;
grant execute on function public.delete_object(uuid) to authenticated;
