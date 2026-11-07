import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types.ts'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * Если конфигурация неверная, приложение показывает понятную ошибку вместо белого экрана
 * и не делает ни одного запроса (см. main.tsx).
 */
export const configError: string | null = !url || !key
  ? 'Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY (см. .env.example).'
  : isSecretKey(key)
    ? 'В VITE_SUPABASE_PUBLISHABLE_KEY указан секретный ключ. Во фронтенд можно класть только publishable (anon) ключ.'
    : null

export const supabase = createClient<Database>(
  configError ? 'http://localhost' : url!,
  configError ? 'invalid' : key!,
)

/**
 * Защита от ошибки конфигурации: секретный ключ (sb_secret_… или legacy service_role JWT)
 * обходит RLS и никогда не должен оказаться в браузере.
 */
function isSecretKey(value: string): boolean {
  if (value.startsWith('sb_secret_')) return true
  const payload = value.split('.')[1]
  if (!payload) return false
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown }
    return json.role === 'service_role'
  } catch {
    return false
  }
}
