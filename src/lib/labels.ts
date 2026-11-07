import type { Database } from './database.types.ts'

export type TaskStatus = Database['public']['Enums']['task_status']
export type UserRole = Database['public']['Enums']['user_role']

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'blue',
  in_progress: 'gold',
  review: 'purple',
  accepted: 'green',
  rework: 'red',
}

/** Порядок статусов в фильтрах и сводках — по жизненному циклу задачи. */
export const STATUS_ORDER: TaskStatus[] = ['new', 'in_progress', 'review', 'rework', 'accepted']

export const ROLE_LABEL: Record<UserRole, string> = {
  manager: 'Постановщик',
  executor: 'Исполнитель',
}

/** Подпись кнопки действия, которое переводит задачу в статус. */
export const ACTION_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'Взять в работу',
  review: 'Отправить на проверку',
  accepted: 'Принять',
  rework: 'Вернуть на доработку',
}
