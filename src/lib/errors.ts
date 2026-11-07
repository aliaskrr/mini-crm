/**
 * Текст ошибки для пользователя.
 * Бизнес-ошибки база отдаёт уже по-русски (см. миграции), системные — переводим.
 */
export function errorMessage(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : ''

  if (!message) return 'Неизвестная ошибка'
  if (message === 'Invalid login credentials') return 'Неверный email или пароль'
  if (message.startsWith('permission denied') || message.includes('row-level security')) {
    return 'Недостаточно прав для этого действия'
  }
  if (message === 'Failed to fetch') return 'Нет связи с сервером'
  return message
}
