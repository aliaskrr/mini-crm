/**
 * Проверка защиты через настоящий HTTP API Supabase — так, как действовал бы сотрудник,
 * открывший консоль браузера: публичный ключ + свой логин, запросы в обход интерфейса.
 * Каждая «атака» должна быть отбита базой. Данные не меняются (кроме случая, когда защита сломана).
 *
 * Запуск (нужен только публичный ключ и пароль демо-сотрудников из сида):
 *   SEED_PASSWORD=... npm run test:api
 * URL и publishable-ключ берутся из .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Database } from '../src/lib/database.types.ts'

type Client = SupabaseClient<Database>

try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local необязателен
}

const url = requireEnv('VITE_SUPABASE_URL')
const publishableKey = requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
const password = requireEnv('SEED_PASSWORD')

let failed = 0

/** Проверка проходит, если fn вернула true. detail — что ответил сервер. */
async function check(name: string, fn: () => Promise<{ ok: boolean; detail: string }>) {
  try {
    const { ok, detail } = await fn()
    if (!ok) failed++
    console.log(`${ok ? '✓' : '✗'} ${name}\n    ${detail}`)
  } catch (error) {
    failed++
    console.log(`✗ ${name}\n    исключение: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Ожидаем, что сервер вернул ошибку. */
const denied = (error: { message: string } | null) => ({
  ok: error !== null,
  detail: error ? `отказ: ${error.message}` : 'ЗАПРОС ПРОШЁЛ — защита не сработала',
})

function client(): Client {
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signIn(email: string): Promise<{ db: Client; id: string }> {
  const db = client()
  const { data, error } = await db.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Не удалось войти как ${email}: ${error.message}`)
  return { db, id: data.user.id }
}

async function main() {
  console.log(`Supabase: ${url}\n`)

  const manager = await signIn('manager@example.com')
  const chief = await signIn('chief@example.com')
  const ivanov = await signIn('ivanov@example.com')

  // Ориентиры для атак — их видит постановщик.
  const { data: allTasks, error } = await manager.db.from('tasks').select('id, title, status, assignee_id, object_id')
  if (error || !allTasks) throw error ?? new Error('Нет задач — сначала запустите npm run seed')
  const foreignTask = allTasks.find((task) => task.assignee_id !== ivanov.id)
  const ownTask = allTasks.find((task) => task.assignee_id === ivanov.id)
  const ownReviewTask = allTasks.find((task) => task.assignee_id === ivanov.id && task.status === 'review')
  const reviewTask = allTasks.find((task) => task.status === 'review')
  const ownObjects = new Set(allTasks.filter((task) => task.assignee_id === ivanov.id).map((task) => task.object_id))
  const { data: allObjects } = await manager.db.from('objects').select('id')
  const hiddenObject = allObjects?.find((object) => !ownObjects.has(object.id))
  if (!foreignTask || !ownTask || !ownReviewTask || !reviewTask || !hiddenObject) {
    throw new Error('Неожиданные демо-данные — перезапустите npm run seed на чистой базе')
  }

  console.log('— Без входа (только публичный ключ) —')
  const anon = client()
  await check('аноним не читает задачи', async () => {
    const { data, error } = await anon.from('tasks').select('id')
    return { ok: Boolean(error) || data?.length === 0, detail: error ? `отказ: ${error.message}` : `строк: ${data?.length}` }
  })
  await check('аноним не читает объекты', async () => {
    const { data, error } = await anon.from('objects').select('id')
    return { ok: Boolean(error) || data?.length === 0, detail: error ? `отказ: ${error.message}` : `строк: ${data?.length}` }
  })
  await check('аноним не вызывает смену статуса', async () =>
    denied((await anon.rpc('change_task_status', { p_task_id: ownTask.id, p_to_status: 'accepted' })).error),
  )
  await check('открытая регистрация отключена', async () =>
    denied((await anon.auth.signUp({ email: `intruder-${randomUUID()}@example.com`, password: 'Intruder12345' })).error),
  )

  console.log('\n— Исполнитель (Иван Иванов) в обход интерфейса —')
  await check('видит только свои задачи', async () => {
    const { data, error } = await ivanov.db.from('tasks').select('id, assignee_id')
    if (error) return { ok: false, detail: error.message }
    const foreign = data.filter((task) => task.assignee_id !== ivanov.id)
    return { ok: foreign.length === 0, detail: `получено задач: ${data.length}, чужих среди них: ${foreign.length}` }
  })
  await check('не читает чужую задачу даже по точному id', async () => {
    const { data, error } = await ivanov.db.from('tasks').select('id').eq('id', foreignTask.id)
    return { ok: !error && data.length === 0, detail: error ? error.message : `строк: ${data.length}` }
  })
  await check('не читает историю чужой задачи', async () => {
    const { data, error } = await ivanov.db.from('task_status_history').select('id').eq('task_id', foreignTask.id)
    return { ok: !error && data.length === 0, detail: error ? error.message : `строк: ${data.length}` }
  })
  await check('видит только объекты, где у него есть задачи', async () => {
    const own = new Set(allTasks.filter((task) => task.assignee_id === ivanov.id).map((task) => task.object_id))
    const { data, error } = await ivanov.db.from('objects').select('id')
    if (error) return { ok: false, detail: error.message }
    const extra = data.filter((object) => !own.has(object.id))
    return { ok: extra.length === 0, detail: `видно объектов: ${data.length}, лишних: ${extra.length}` }
  })
  await check('не видит профили других исполнителей', async () => {
    const { data, error } = await ivanov.db.from('profiles').select('id, role')
    if (error) return { ok: false, detail: error.message }
    const others = data.filter((profile) => profile.role === 'executor' && profile.id !== ivanov.id)
    return { ok: others.length === 0, detail: `видно профилей: ${data.length}, других исполнителей: ${others.length}` }
  })
  await check('не меняет статус прямым UPDATE', async () =>
    denied((await ivanov.db.from('tasks').update({ status: 'accepted' }).eq('id', ownTask.id)).error),
  )
  await check('не меняет поля своей задачи', async () => {
    const { data, error } = await ivanov.db.from('tasks').update({ title: 'Взлом' }).eq('id', ownTask.id).select('id')
    return { ok: Boolean(error) || data?.length === 0, detail: error ? `отказ: ${error.message}` : `изменено строк: ${data?.length}` }
  })
  await check('не принимает свою задачу сам', async () =>
    denied((await ivanov.db.rpc('change_task_status', { p_task_id: ownReviewTask.id, p_to_status: 'accepted' })).error),
  )
  await check('не двигает чужую задачу', async () =>
    denied((await ivanov.db.rpc('change_task_status', { p_task_id: foreignTask.id, p_to_status: 'in_progress' })).error),
  )
  await check('не подделывает запись в истории', async () =>
    denied(
      (
        await ivanov.db
          .from('task_status_history')
          .insert({ task_id: ownTask.id, to_status: 'accepted', changed_by: manager.id })
      ).error,
    ),
  )
  await check('не правит историю', async () =>
    denied((await ivanov.db.from('task_status_history').update({ comment: 'подделка' }).eq('task_id', ownTask.id)).error),
  )
  await check('не удаляет историю', async () =>
    denied((await ivanov.db.from('task_status_history').delete().eq('task_id', ownTask.id)).error),
  )
  await check('не удаляет задачу', async () => denied((await ivanov.db.from('tasks').delete().eq('id', ownTask.id)).error))
  await check('по тексту отказа не узнать, существует ли чужой объект и исполнитель', async () => {
    const existing = await ivanov.db
      .from('tasks')
      .insert({ object_id: hiddenObject.id, title: 'x', assignee_id: foreignTask.assignee_id })
    const random = await ivanov.db
      .from('tasks')
      .insert({ object_id: randomUUID(), title: 'x', assignee_id: randomUUID() })
    const same = existing.error !== null && existing.error.message === random.error?.message
    return {
      ok: same,
      detail: `существующие id: «${existing.error?.message}»; случайные: «${random.error?.message}»`,
    }
  })
  await check('не выдаёт себе роль постановщика в profiles', async () =>
    denied((await ivanov.db.from('profiles').update({ role: 'manager' }).eq('id', ivanov.id)).error),
  )
  await check('роль из user_metadata ничего не даёт', async () => {
    await ivanov.db.auth.updateUser({ data: { role: 'manager' } })
    const { error } = await ivanov.db.from('objects').insert({ name: 'Взлом', address: 'нет' })
    await ivanov.db.auth.updateUser({ data: { role: null } })
    return denied(error)
  })

  console.log('\n— Постановщик: правила, которые база не даёт нарушить и ему —')
  await check('нельзя создать задачу сразу «Принятой»', async () =>
    denied(
      (
        await manager.db
          .from('tasks')
          .insert({ object_id: ownTask.object_id, title: 'x', assignee_id: ivanov.id, status: 'accepted' })
      ).error,
    ),
  )
  await check('нельзя подставить чужого автора', async () =>
    denied(
      (
        await manager.db
          .from('tasks')
          .insert({ object_id: ownTask.object_id, title: 'x', assignee_id: ivanov.id, author_id: chief.id })
      ).error,
    ),
  )
  await check('нельзя назначить исполнителем постановщика', async () =>
    denied(
      (await manager.db.from('tasks').insert({ object_id: ownTask.object_id, title: 'x', assignee_id: chief.id })).error,
    ),
  )
  await check('статус меняется только через функцию', async () =>
    denied((await manager.db.from('tasks').update({ status: 'accepted' }).eq('id', reviewTask.id)).error),
  )
  await check('«На доработку» без комментария не проходит', async () =>
    denied((await manager.db.rpc('change_task_status', { p_task_id: reviewTask.id, p_to_status: 'rework' })).error),
  )
  await check('«На доработку» с «пустым» комментарием (переводы строк, невидимые символы) не проходит', async () =>
    denied(
      (
        await manager.db.rpc('change_task_status', {
          p_task_id: reviewTask.id,
          p_to_status: 'rework',
          p_comment: String.fromCharCode(0x0a, 0x09, 0xa0, 0x200b),
        })
      ).error,
    ),
  )
  await check('нельзя перепрыгнуть статус (Новая → Принята)', async () => {
    const newTask = allTasks.find((task) => task.status === 'new')!
    return denied((await manager.db.rpc('change_task_status', { p_task_id: newTask.id, p_to_status: 'accepted' })).error)
  })
  await check('нельзя физически удалить задачу', async () =>
    denied((await manager.db.from('tasks').delete().eq('id', reviewTask.id)).error),
  )
  await check('нельзя дописать историю', async () =>
    denied(
      (
        await manager.db
          .from('task_status_history')
          .insert({ task_id: reviewTask.id, to_status: 'accepted', changed_by: manager.id })
      ).error,
    ),
  )

  console.log(failed === 0 ? '\nВсе атаки отбиты ✓' : `\nПровалено проверок: ${failed} ✗`)
  process.exit(failed === 0 ? 0 : 1)
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Не задана переменная окружения ${name} (см. .env.example)`)
    process.exit(1)
  }
  return value
}

main().catch((error: unknown) => {
  console.error('\n✗ Ошибка:', error instanceof Error ? error.message : error)
  process.exit(1)
})
