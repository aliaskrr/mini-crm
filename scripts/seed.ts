/**
 * Демо-данные: 2 постановщика, 2 исполнителя, 3 объекта, задачи во всех статусах.
 *
 * Пользователи создаются через Admin API — для этого нужен секретный ключ. Скрипт запускается
 * только локально (на машине администратора); ключ берётся из переменной окружения
 * SUPABASE_SECRET_KEY и не попадает ни в репозиторий, ни в браузер.
 *
 * Всё остальное (объекты, задачи, смены статусов) делается от имени самих сотрудников
 * через обычный API с publishable-ключом — теми же запросами, что и интерфейс.
 * Поэтому сид заодно проверяет RLS и переходы статусов, а история получается настоящей.
 *
 * Запуск:
 *   SUPABASE_SECRET_KEY=... SEED_PASSWORD=... npm run seed
 * URL и publishable-ключ берутся из .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import type { Database } from '../src/lib/database.types.ts'

type Client = SupabaseClient<Database>
type Role = Database['public']['Enums']['user_role']
type Status = Database['public']['Enums']['task_status']

try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local необязателен: переменные можно передать напрямую
}

const url = requireEnv('VITE_SUPABASE_URL')
const publishableKey = requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
const secretKey = requireEnv('SUPABASE_SECRET_KEY')
const password = process.env.SEED_PASSWORD || `Crm${randomBytes(6).toString('base64url')}7`

const PEOPLE = {
  manager: { email: 'manager@example.com', fullName: 'Анна Смирнова', role: 'manager' },
  chief: { email: 'chief@example.com', fullName: 'Олег Кузнецов', role: 'manager' },
  ivanov: { email: 'ivanov@example.com', fullName: 'Иван Иванов', role: 'executor' },
  petrov: { email: 'petrov@example.com', fullName: 'Пётр Петров', role: 'executor' },
} satisfies Record<string, { email: string; fullName: string; role: Role }>

type Person = keyof typeof PEOPLE

/** Шаг жизненного цикла: кто переводит задачу и в какой статус. */
type Step = { by: Person; to: Status; comment?: string }

type TaskSeed = {
  title: string
  description: string
  author: Person
  assignee: Person
  steps: Step[]
}

const OBJECTS: { name: string; address: string; tasks: TaskSeed[] }[] = [
  {
    name: 'ЖК «Северный парк», корпус 2',
    address: 'г. Москва, ул. Лесная, 12',
    tasks: [
      {
        title: 'Залить фундамент секции А',
        description: 'Бетон B25, заливка в один приём. После заливки — уход за бетоном 7 дней.',
        author: 'manager',
        assignee: 'ivanov',
        steps: [
          { by: 'ivanov', to: 'in_progress' },
          { by: 'ivanov', to: 'review', comment: 'Фундамент залит, фото и акт скрытых работ приложены.' },
          { by: 'manager', to: 'accepted', comment: 'Принято, спасибо.' },
        ],
      },
      {
        title: 'Монтаж опалубки 3 этажа',
        description: 'Щитовая опалубка перекрытия, отметка +6.600. Проверить вертикаль стоек.',
        author: 'manager',
        assignee: 'ivanov',
        steps: [
          { by: 'ivanov', to: 'in_progress' },
          { by: 'ivanov', to: 'review', comment: 'Опалубка выставлена, можно принимать.' },
        ],
      },
      {
        title: 'Армирование плиты перекрытия 3 этажа',
        description: 'Армирование по проекту КЖ-3: нижняя и верхняя сетки, шаг 200 мм.',
        author: 'chief',
        assignee: 'petrov',
        steps: [
          { by: 'petrov', to: 'in_progress' },
          { by: 'petrov', to: 'review' },
          {
            by: 'chief',
            to: 'rework',
            comment: 'Шаг арматуры 250 мм вместо 200 мм по КЖ-3. Переделать и прислать фото.',
          },
        ],
      },
      {
        title: 'Гидроизоляция подвала',
        description: 'Обмазочная гидроизоляция стен подвала в два слоя.',
        author: 'manager',
        assignee: 'petrov',
        steps: [],
      },
    ],
  },
  {
    name: 'Склад «Логистик-Юг»',
    address: 'Московская обл., г. Подольск, ул. Промышленная, 5',
    tasks: [
      {
        title: 'Устройство бетонного пола в зоне хранения',
        description: 'Площадь 1200 м², упрочнённый верхний слой, нарезка швов.',
        author: 'manager',
        assignee: 'petrov',
        steps: [{ by: 'petrov', to: 'in_progress', comment: 'Начали с оси 1–4.' }],
      },
      {
        title: 'Монтаж секционных ворот',
        description: 'Четверо ворот 4×4,5 м на рампе. Ворота на объекте, проверить комплектность.',
        author: 'chief',
        assignee: 'ivanov',
        steps: [],
      },
    ],
  },
  {
    name: 'Частный дом в Истре',
    address: 'Московская обл., г. о. Истра, д. Лужки, ул. Садовая, 7',
    tasks: [
      {
        title: 'Кладка стен первого этажа',
        description: 'Газобетон D500, 375 мм, армирование каждого четвёртого ряда.',
        author: 'manager',
        assignee: 'petrov',
        steps: [
          { by: 'petrov', to: 'in_progress' },
          { by: 'petrov', to: 'review' },
          { by: 'manager', to: 'rework', comment: 'Нарушена перевязка швов в углах — переложить два ряда.' },
          { by: 'petrov', to: 'in_progress', comment: 'Переделываю, закончу к пятнице.' },
        ],
      },
      {
        title: 'Монтаж стропильной системы',
        description: 'Двускатная кровля, доска 50×200, шаг стропил 600 мм.',
        author: 'chief',
        assignee: 'petrov',
        steps: [],
      },
    ],
  },
]

const admin: Client = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  console.log(`Supabase: ${url}\n`)

  // 1. Сотрудники: учётная запись (Admin API) + профиль с ролью.
  const ids = {} as Record<Person, string>
  const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw listError

  for (const [key, person] of Object.entries(PEOPLE) as [Person, (typeof PEOPLE)[Person]][]) {
    const found = existing.users.find((user) => user.email === person.email)
    if (found) {
      const { error } = await admin.auth.admin.updateUserById(found.id, { password })
      if (error) throw error
      ids[key] = found.id
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: person.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: person.fullName },
      })
      if (error) throw error
      ids[key] = data.user.id
    }

    const { error: profileError } = await admin
      .from('profiles')
      .upsert({ id: ids[key], full_name: person.fullName, role: person.role })
    if (profileError) throw profileError
    console.log(`✓ сотрудник ${person.fullName} (${person.role}) — ${person.email}`)
  }

  // 2. Сессии сотрудников: дальше всё делается их руками через обычный API.
  const as = {} as Record<Person, Client>
  for (const key of Object.keys(PEOPLE) as Person[]) as[key] = await signIn(PEOPLE[key].email)

  const { count, error: countError } = await as.manager.from('objects').select('id', { count: 'exact', head: true })
  if (countError) throw countError
  if ((count ?? 0) > 0) {
    console.log('\nОбъекты уже есть — демо-данные не добавляю (пароли сотрудников обновлены).')
  } else {
    for (const object of OBJECTS) {
      const { data: created, error } = await as.manager
        .from('objects')
        .insert({ name: object.name, address: object.address })
        .select('id')
        .single()
      if (error) throw error
      console.log(`\n✓ объект «${object.name}»`)

      for (const task of object.tasks) {
        const { data: createdTask, error: taskError } = await as[task.author]
          .from('tasks')
          .insert({
            object_id: created.id,
            title: task.title,
            description: task.description,
            assignee_id: ids[task.assignee],
          })
          .select('id')
          .single()
        if (taskError) throw taskError

        for (const step of task.steps) {
          const { error: stepError } = await as[step.by].rpc('change_task_status', {
            p_task_id: createdTask.id,
            p_to_status: step.to,
            p_comment: step.comment,
          })
          if (stepError) throw new Error(`«${task.title}» → ${step.to}: ${stepError.message}`)
        }
        const finalStatus = task.steps.at(-1)?.to ?? 'new'
        console.log(`  ✓ задача «${task.title}» → ${finalStatus}`)
      }
    }
  }

  console.log('\nДоступы (пароль у всех один):')
  console.table(
    Object.values(PEOPLE).map((person) => ({
      Роль: person.role === 'manager' ? 'Постановщик' : 'Исполнитель',
      Сотрудник: person.fullName,
      Email: person.email,
      Пароль: password,
    })),
  )
}

async function signIn(email: string): Promise<Client> {
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Не удалось войти как ${email}: ${error.message}`)
  return client
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
