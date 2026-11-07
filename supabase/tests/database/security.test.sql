-- =============================================================================
-- Тесты безопасности и бизнес-правил на уровне базы (pgTAP).
-- Запуск: supabase test db
--
-- Каждая проверка выполняется от имени конкретной роли (anon / сотрудник / service_role)
-- ровно так, как это делает PostgREST: SET ROLE + JWT-claims в request.jwt.claims.
-- То есть тест обходит интерфейс и бьёт прямо в базу — как злоумышленник с curl.
-- Всё выполняется в транзакции и откатывается в конце.
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(88);

-- -----------------------------------------------------------------------------
-- Подготовка: тестовые сотрудники, объекты, задачи
-- -----------------------------------------------------------------------------
create schema tests;

create table tests.ids (name text primary key, id uuid not null default gen_random_uuid());
insert into tests.ids (name)
values ('M1'), ('M2'), ('E1'), ('E2'), ('NP'), ('O1'), ('O2'), ('O3'), ('T1'), ('T2'), ('T3'), ('T4');

create function tests.id(p_name text) returns uuid
language sql stable
as $$ select id from tests.ids where name = p_name $$;

-- Войти как сотрудник: так PostgREST выполняет запрос с JWT пользователя.
create function tests.act_as(p_name text) returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.id(p_name), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Запрос без входа (только публичный ключ).
create function tests.act_as_anon() returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Запрос с секретным ключом service_role.
create function tests.act_as_service_role() returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end;
$$;

grant usage on schema tests to anon, authenticated, service_role;
grant select on tests.ids to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- M1, M2 — постановщики; E1, E2 — исполнители; NP — пользователь без профиля (без роли).
insert into auth.users (id, email)
select tests.id(n), lower(n) || '@test.local'
from unnest(array['M1', 'M2', 'E1', 'E2', 'NP']) as n;

insert into public.profiles (id, full_name, role) values
  (tests.id('M1'), 'Анна (постановщик)',  'manager'),
  (tests.id('M2'), 'Борис (постановщик)', 'manager'),
  (tests.id('E1'), 'Иван (исполнитель)',  'executor'),
  (tests.id('E2'), 'Пётр (исполнитель)',  'executor');

insert into public.objects (id, name, address, created_by) values
  (tests.id('O1'), 'Объект 1', 'Адрес 1', tests.id('M1')),
  (tests.id('O2'), 'Объект 2', 'Адрес 2', tests.id('M1')),
  (tests.id('O3'), 'Объект 3', 'Адрес 3', tests.id('M2'));

-- O1: задачи E1 и E2; O2: только E2; O3: пока без задач.
insert into public.tasks (id, object_id, title, assignee_id, author_id) values
  (tests.id('T1'), tests.id('O1'), 'T1', tests.id('E1'), tests.id('M1')),
  (tests.id('T2'), tests.id('O1'), 'T2', tests.id('E1'), tests.id('M1')),
  (tests.id('T3'), tests.id('O1'), 'T3', tests.id('E2'), tests.id('M2')),
  (tests.id('T4'), tests.id('O2'), 'T4', tests.id('E2'), tests.id('M1'));

-- -----------------------------------------------------------------------------
-- 1. Без входа (anon) — ничего
-- -----------------------------------------------------------------------------
select tests.act_as_anon();

select throws_ok($$ select * from public.tasks $$, '42501', null,
  'anon: задачи не читаются');
select throws_ok($$ select * from public.objects $$, '42501', null,
  'anon: объекты не читаются');
select throws_ok($$ select * from public.task_status_history $$, '42501', null,
  'anon: история не читается');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'in_progress') $$, '42501', null,
  'anon: функции смены статуса недоступны');

reset role;

-- -----------------------------------------------------------------------------
-- 2. Что видит исполнитель
-- -----------------------------------------------------------------------------
select tests.act_as('E1');

select set_eq($$ select id from public.tasks $$,
  $$ values (tests.id('T1')), (tests.id('T2')) $$,
  'исполнитель видит только свои задачи');
select set_eq($$ select id from public.objects $$,
  $$ values (tests.id('O1')) $$,
  'исполнитель видит только объекты, где у него есть задачи');
select set_eq($$ select full_name from public.profiles where id in (select id from tests.ids) $$,
  $$ values ('Анна (постановщик)'), ('Борис (постановщик)'), ('Иван (исполнитель)') $$,
  'исполнитель видит себя и постановщиков');
select is_empty($$ select id from public.profiles where role = 'executor' and id <> tests.id('E1') $$,
  'исполнитель не видит ни одного другого исполнителя');
select set_eq($$ select distinct task_id from public.task_status_history $$,
  $$ values (tests.id('T1')), (tests.id('T2')) $$,
  'исполнитель видит историю только своих задач');
select is_empty($$ select * from public.tasks where id = tests.id('T3') $$,
  'чужую задачу не прочитать даже по точному id');
select is_empty($$ select * from public.get_available_transitions(tests.id('T3')) $$,
  'по чужой задаче нет доступных действий');
select results_eq($$ select to_status::text from public.get_available_transitions(tests.id('T1')) $$,
  $$ values ('in_progress') $$,
  'для новой задачи исполнителю доступно только «Взять в работу»');

reset role;

-- -----------------------------------------------------------------------------
-- 3. Что видит постановщик
-- -----------------------------------------------------------------------------
select tests.act_as('M1');

-- Проверки ограничены тестовыми записями: в базе могут быть и демо-данные из сида.
select set_eq($$ select id from public.tasks where id in (select id from tests.ids) $$,
  $$ values (tests.id('T1')), (tests.id('T2')), (tests.id('T3')), (tests.id('T4')) $$,
  'постановщик видит все задачи');
select set_eq($$ select id from public.objects where id in (select id from tests.ids) $$,
  $$ values (tests.id('O1')), (tests.id('O2')), (tests.id('O3')) $$,
  'постановщик видит все объекты');
select results_eq($$ select count(*)::int from public.profiles where id in (select id from tests.ids) $$,
  $$ values (4) $$,
  'постановщик видит всех сотрудников');
select is_empty($$ select * from public.get_available_transitions(tests.id('T1')) $$,
  'постановщик не может взять задачу в работу за исполнителя');

reset role;

-- -----------------------------------------------------------------------------
-- 4. Пользователь без профиля (например, если кто-то всё же зарегистрировался)
-- -----------------------------------------------------------------------------
select tests.act_as('NP');

select is_empty($$ select * from public.tasks $$, 'без роли: задач не видно');
select is_empty($$ select * from public.objects $$, 'без роли: объектов не видно');
select is_empty($$ select * from public.profiles $$, 'без роли: сотрудников не видно');
select throws_ok($$ insert into public.objects (name, address) values ('x', 'y') $$, '42501', null,
  'без роли: создать объект нельзя');

reset role;

-- -----------------------------------------------------------------------------
-- 5. Исполнитель пытается писать в обход интерфейса
-- -----------------------------------------------------------------------------
select tests.act_as('E1');

select throws_ok($$ insert into public.objects (name, address) values ('Взлом', 'нет') $$, '42501', null,
  'исполнитель не может создать объект');
select is_empty($$ update public.objects set name = 'Взлом' where id = tests.id('O1') returning id $$,
  'исполнитель не может переименовать объект');
select throws_ok(
  $$ insert into public.tasks (object_id, title, assignee_id) values (tests.id('O1'), 'Взлом', tests.id('E1')) $$,
  '42501', null,
  'исполнитель не может создать задачу');
-- Ответ одинаков для существующих чужих id и для случайных: по ошибке нельзя узнать,
-- есть ли такой объект или исполнитель.
select throws_ok(
  $$ insert into public.tasks (object_id, title, assignee_id) values (tests.id('O2'), 'x', tests.id('E2')) $$,
  '42501', 'Создавать задачи может только постановщик',
  'попытка вставки с чужим объектом и чужим исполнителем — общий отказ');
select throws_ok(
  $$ insert into public.tasks (object_id, title, assignee_id) values (gen_random_uuid(), 'x', gen_random_uuid()) $$,
  '42501', 'Создавать задачи может только постановщик',
  'попытка вставки с несуществующими id — тот же отказ');
select is_empty($$ update public.tasks set title = 'Взлом' where id = tests.id('T1') returning id $$,
  'исполнитель не может менять поля даже своей задачи');
select throws_ok($$ update public.tasks set status = 'accepted' where id = tests.id('T1') $$, '42501', null,
  'исполнитель не может сменить статус прямым UPDATE');
select throws_ok($$ delete from public.tasks where id = tests.id('T1') $$, '42501', null,
  'исполнитель не может удалить задачу DELETE-запросом');
select throws_ok($$ select public.delete_task(tests.id('T1')) $$,
  '42501', 'Удалять задачи может только постановщик',
  'исполнитель не может удалить задачу через функцию');
select throws_ok($$ select public.delete_object(tests.id('O1')) $$,
  '42501', 'Удалять объекты может только постановщик',
  'исполнитель не может удалить объект');
select throws_ok($$ update public.profiles set role = 'manager' where id = tests.id('E1') $$, '42501', null,
  'исполнитель не может выдать себе роль постановщика');
select throws_ok(
  $$ insert into public.task_status_history (task_id, to_status, changed_by)
     values (tests.id('T1'), 'accepted', tests.id('M1')) $$,
  '42501', null,
  'исполнитель не может подделать запись истории');
select throws_ok($$ update public.task_status_history set comment = 'подделка' $$, '42501', null,
  'исполнитель не может изменить историю');
select throws_ok($$ delete from public.task_status_history $$, '42501', null,
  'исполнитель не может удалить историю');

reset role;

-- -----------------------------------------------------------------------------
-- 6. Постановщик: что база не даёт сделать даже ему
-- -----------------------------------------------------------------------------
select tests.act_as('M1');

select throws_ok(
  $$ insert into public.tasks (object_id, title, assignee_id, status)
     values (tests.id('O1'), 'x', tests.id('E1'), 'accepted') $$,
  '42501', null,
  'задачу нельзя создать сразу в статусе, отличном от «Новая»');
select throws_ok(
  $$ insert into public.tasks (object_id, title, assignee_id, author_id)
     values (tests.id('O1'), 'x', tests.id('E1'), tests.id('M2')) $$,
  '42501', null,
  'автора задачи нельзя подставить — его ставит база');
select throws_ok($$ update public.tasks set status = 'accepted' where id = tests.id('T1') $$, '42501', null,
  'постановщик тоже не меняет статус прямым UPDATE');
select throws_ok(
  $$ insert into public.tasks (object_id, title, assignee_id) values (tests.id('O1'), 'x', tests.id('M2')) $$,
  'P0001', 'Исполнителем можно назначить только сотрудника с ролью «Исполнитель»',
  'исполнителем нельзя назначить постановщика');
select throws_ok($$ delete from public.tasks where id = tests.id('T1') $$, '42501', null,
  'физически удалить задачу через API нельзя');
select throws_ok(
  $$ insert into public.task_status_history (task_id, to_status, changed_by)
     values (tests.id('T1'), 'accepted', tests.id('M1')) $$,
  '42501', null,
  'постановщик тоже не пишет в историю напрямую');
select throws_ok(
  $$ insert into public.tasks (object_id, title, assignee_id) values (tests.id('O1'), U&'\000A\0009\200B', tests.id('E1')) $$,
  '23514', null,
  'название из пробелов и невидимых символов не принимается');

select lives_ok(
  $$ insert into public.tasks (object_id, title, description, assignee_id)
     values (tests.id('O3'), 'T5', 'Описание', tests.id('E1')) $$,
  'постановщик создаёт задачу');
select results_eq(
  $$ select status::text, author_id from public.tasks where title = 'T5' $$,
  $$ values ('new', tests.id('M1')) $$,
  'статус «Новая» и автор проставлены базой');
select results_eq(
  $$ select h.from_status::text, h.to_status::text, h.changed_by
     from public.task_status_history h
     join public.tasks t on t.id = h.task_id
     where t.title = 'T5' $$,
  $$ values (null::text, 'new', tests.id('M1')) $$,
  'создание задачи записано в историю');

reset role;
select tests.act_as('E1');

select set_eq($$ select id from public.objects $$,
  $$ values (tests.id('O1')), (tests.id('O3')) $$,
  'объект появляется у исполнителя, когда ему назначили там задачу');

reset role;

-- -----------------------------------------------------------------------------
-- 7. Переходы статусов (на задаче T1 исполнителя E1)
-- -----------------------------------------------------------------------------
select tests.act_as('M1');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'in_progress') $$,
  '42501', 'Это действие доступно только исполнителю, назначенному на задачу',
  'Новая → В работе: постановщик не может');
reset role;

select tests.act_as('E2');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'in_progress') $$,
  'PT404', 'Задача не найдена',
  'Новая → В работе: другой исполнитель не может (и даже не видит задачу)');
reset role;

select tests.act_as('E1');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'review') $$,
  'P0001', 'Переход «Новая» → «На проверке» запрещён',
  'Новая → На проверке: запрещено, минуя «В работе»');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'accepted') $$,
  'P0001', 'Переход «Новая» → «Принята» запрещён',
  'Новая → Принята: запрещено');
select lives_ok($$ select public.change_task_status(tests.id('T1'), 'in_progress') $$,
  'Новая → В работе: назначенный исполнитель может');
-- Пробелы и переводы строк по краям комментария обрезаются (см. историю ниже).
select lives_ok($$ select public.change_task_status(tests.id('T1'), 'review', E'\n  Готово, фото в чате \n') $$,
  'В работе → На проверке: назначенный исполнитель может');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'accepted') $$,
  '42501', 'Это действие доступно только постановщику',
  'На проверке → Принята: исполнитель не может принять сам себя');
reset role;

select tests.act_as('M1');
select results_eq(
  $$ select to_status::text, comment_required from public.get_available_transitions(tests.id('T1')) order by 1 $$,
  $$ values ('accepted', false), ('rework', true) $$,
  'на проверке постановщику доступны «Принять» и «На доработку» (с комментарием)');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'rework') $$,
  'P0001', 'Для перевода в статус «На доработке» нужен комментарий',
  'На проверке → На доработке: без комментария нельзя');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'rework', '   ') $$,
  'P0001', 'Для перевода в статус «На доработке» нужен комментарий',
  'На проверке → На доработке: комментарий из пробелов не считается');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'rework', E'\n\t\r\n') $$,
  'P0001', 'Для перевода в статус «На доработке» нужен комментарий',
  'На проверке → На доработке: переводы строк и табуляции — тоже не комментарий');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'rework', U&'\00A0\200B\FEFF') $$,
  'P0001', 'Для перевода в статус «На доработке» нужен комментарий',
  'На проверке → На доработке: неразрывные и невидимые символы Юникода — тоже не комментарий');
select lives_ok($$ select public.change_task_status(tests.id('T1'), 'rework', 'Переделать армирование') $$,
  'На проверке → На доработке: постановщик с комментарием может');
reset role;

select tests.act_as('E1');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'review') $$,
  'P0001', 'Переход «На доработке» → «На проверке» запрещён',
  'На доработке → На проверке: запрещено, минуя «В работе»');
select lives_ok($$ select public.change_task_status(tests.id('T1'), 'in_progress') $$,
  'На доработке → В работе: назначенный исполнитель может');
select lives_ok($$ select public.change_task_status(tests.id('T1'), 'review') $$,
  'повторная отправка на проверку');
reset role;

select tests.act_as('M2');
select lives_ok($$ select public.change_task_status(tests.id('T1'), 'accepted') $$,
  'На проверке → Принята: любой постановщик может');
select throws_ok($$ select public.change_task_status(tests.id('T1'), 'rework', 'ещё раз') $$,
  'P0001', 'Переход «Принята» → «На доработке» запрещён',
  '«Принята» — финальный статус');
reset role;

select tests.act_as('E1');
select is_empty($$ select * from public.get_available_transitions(tests.id('T1')) $$,
  'у принятой задачи нет доступных действий');
select results_eq(
  $$ select from_status::text, to_status::text, changed_by, comment
     from public.task_status_history
     where task_id = tests.id('T1')
     order by id $$,
  $$ values (null::text, 'new', tests.id('M1'), null::text),
            ('new',         'in_progress', tests.id('E1'), null),
            ('in_progress', 'review',      tests.id('E1'), 'Готово, фото в чате'),
            ('review',      'rework',      tests.id('M1'), 'Переделать армирование'),
            ('rework',      'in_progress', tests.id('E1'), null),
            ('in_progress', 'review',      tests.id('E1'), null),
            ('review',      'accepted',    tests.id('M2'), null) $$,
  'история: каждая смена статуса — кто, откуда, куда, с каким комментарием');
reset role;

-- -----------------------------------------------------------------------------
-- 8. Переназначение задачи
-- -----------------------------------------------------------------------------
select tests.act_as('M1');
select lives_ok($$ update public.tasks set assignee_id = tests.id('E1') where id = tests.id('T3') $$,
  'постановщик переназначает задачу другому исполнителю');
reset role;

select tests.act_as('E2');
select is_empty($$ select * from public.tasks where id = tests.id('T3') $$,
  'прежний исполнитель больше не видит задачу');
select throws_ok($$ select public.change_task_status(tests.id('T3'), 'in_progress') $$,
  'PT404', 'Задача не найдена',
  'прежний исполнитель больше не может её двигать');
reset role;

select tests.act_as('E1');
select lives_ok($$ select public.change_task_status(tests.id('T3'), 'in_progress') $$,
  'новый исполнитель может работать с задачей');
reset role;

-- -----------------------------------------------------------------------------
-- 9. Второй рубеж: триггеры и внешние ключи срабатывают даже для владельца таблиц
--    (на случай ошибки в коде), а секретный ключ service_role через API может только читать.
--    Администратор БД с прямым SQL-доступом технически может выключить любую защиту —
--    это вне модели угроз «через API».
-- -----------------------------------------------------------------------------
select throws_ok($$ update public.task_status_history set comment = 'подделка' $$,
  '42501', 'История статусов неизменяема (операция UPDATE запрещена)',
  'триггер: прямой UPDATE истории отклоняется даже от владельца таблицы');
select throws_ok($$ delete from public.task_status_history $$,
  '42501', 'История статусов неизменяема (операция DELETE запрещена)',
  'триггер: прямой DELETE истории отклоняется даже от владельца таблицы');
select throws_ok($$ truncate public.task_status_history $$,
  '42501', 'История статусов неизменяема (операция TRUNCATE запрещена)',
  'триггер: TRUNCATE истории отклоняется даже от владельца таблицы');
select throws_ok($$ update public.tasks set status = 'new' where id = tests.id('T1') $$,
  '42501', 'Статус задачи меняется только через change_task_status()',
  'триггер: прямой UPDATE статуса отклоняется даже от владельца таблицы');
select throws_ok($$ delete from public.tasks where id = tests.id('T2') $$, '23503', null,
  'внешний ключ: задачу с историей нельзя физически удалить');

select tests.act_as_service_role();
select throws_ok(
  $$ insert into public.task_status_history (task_id, to_status, changed_by)
     values (tests.id('T1'), 'new', tests.id('M1')) $$,
  '42501', null,
  'service_role не может дописать историю');
select throws_ok($$ update public.tasks set status = 'new' where id = tests.id('T1') $$,
  '42501', null,
  'service_role не может сменить статус в обход функции');
select throws_ok(
  $$ insert into public.tasks (object_id, title, assignee_id, author_id)
     values (tests.id('O1'), 'x', tests.id('E1'), tests.id('E2')) $$,
  '42501', null,
  'service_role не может создать задачу (и запись о создании от чужого имени)');
select throws_ok($$ delete from public.objects where id = tests.id('O3') $$,
  '42501', null,
  'service_role не может физически удалить объект');
reset role;

-- -----------------------------------------------------------------------------
-- 10. Удаление — пометкой, история сохраняется
-- -----------------------------------------------------------------------------
select tests.act_as('M1');
select lives_ok($$ select public.delete_task(tests.id('T4')) $$,
  'постановщик удаляет задачу');
select is_empty($$ select * from public.tasks where id = tests.id('T4') $$,
  'удалённая задача не видна');
reset role;

select tests.act_as('E2');
select is_empty($$ select * from public.objects where id = tests.id('O2') $$,
  'объект пропал у исполнителя: его задач там больше нет');
select throws_ok($$ select public.change_task_status(tests.id('T4'), 'in_progress') $$,
  'PT404', 'Задача не найдена',
  'удалённую задачу нельзя двигать');
reset role;

select tests.act_as('M1');
select lives_ok($$ select public.delete_object(tests.id('O1')) $$,
  'постановщик удаляет объект');
select is_empty($$ select * from public.tasks where object_id = tests.id('O1') $$,
  'вместе с объектом скрываются его задачи');
select throws_ok(
  $$ insert into public.tasks (object_id, title, assignee_id) values (tests.id('O1'), 'x', tests.id('E1')) $$,
  'P0001', 'Объект не найден или удалён',
  'в удалённый объект нельзя добавить задачу');
select is_empty($$ update public.objects set name = 'x' where id = tests.id('O1') returning id $$,
  'удалённый объект нельзя редактировать');
reset role;

select ok((select count(*) from public.task_status_history where task_id = tests.id('T4')) > 0,
  'история удалённой задачи осталась в базе');
select is((select deleted_by from public.tasks where id = tests.id('T4')), tests.id('M1'),
  'в базе записано, кто удалил задачу');

select * from finish();
rollback;
