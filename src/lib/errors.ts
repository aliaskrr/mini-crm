type ErrorParts = { message: string; code: string }

function parts(error: unknown): ErrorParts {
  if (!error || typeof error !== 'object') return { message: '', code: '' }
  const record = error as { message?: unknown; code?: unknown }
  return {
    message: typeof record.message === 'string' ? record.message : '',
    code: typeof record.code === 'string' ? record.code : '',
  }
}

// Разные браузеры по-разному называют сбой сети; supabase-js добавляет к тексту имя ошибки.
const NETWORK_ERROR = /Failed to fetch|NetworkError|Load failed|fetch failed|Network request failed/i

/** Ошибка связи с сервером (а не отказ базы) — такую имеет смысл повторить. */
export function isNetworkError(error: unknown): boolean {
  return NETWORK_ERROR.test(parts(error).message)
}

/** Системные ошибки PostgREST, Postgres и Supabase Auth — по коду. */
const MESSAGE_BY_CODE: Record<string, string> = {
  PGRST116: 'Запись не найдена — возможно, её только что удалили',
  PGRST301: 'Сессия недействительна. Выйдите и войдите снова',
  PGRST303: 'Сессия устарела. Выйдите и войдите снова',
  '22P02': 'Некорректный идентификатор записи',
  '23514': 'Проверьте заполнение полей',
  invalid_credentials: 'Неверный email или пароль',
  user_banned: 'Учётная запись заблокирована. Обратитесь к администратору',
  email_not_confirmed: 'Email не подтверждён. Обратитесь к администратору',
  over_request_rate_limit: 'Слишком много попыток. Подождите минуту и попробуйте снова',
  signup_disabled: 'Регистрация закрыта',
  session_not_found: 'Сессия завершена. Войдите снова',
  refresh_token_not_found: 'Сессия завершена. Войдите снова',
}

/**
 * Текст ошибки для пользователя.
 * Бизнес-ошибки база отдаёт уже по-русски (см. миграции), системные — переводим.
 */
export function errorMessage(error: unknown): string {
  const { message, code } = parts(error)

  if (isNetworkError(error)) return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз'
  const byCode = MESSAGE_BY_CODE[code]
  if (byCode) return byCode
  if (message === 'Invalid login credentials') return 'Неверный email или пароль'
  if (message.startsWith('permission denied') || message.includes('row-level security')) {
    return 'Недостаточно прав для этого действия'
  }
  return message || 'Неизвестная ошибка'
}
