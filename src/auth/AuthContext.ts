import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { Tables } from '../lib/database.types.ts'

export type Profile = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'role'>

export type AuthContextValue = {
  /** Идёт восстановление сессии или загрузка профиля. */
  loading: boolean
  session: Session | null
  /** null — пользователь вошёл, но администратор не завёл ему профиль (роль). */
  profile: Profile | null
  profileError: unknown
  /**
   * Только для отображения интерфейса. Реальные права проверяет база (RLS),
   * поэтому подмена этого флага в браузере ничего не даёт.
   */
  isManager: boolean
  /** Пользователь сам нажал «Выйти»: после входа не возвращаем на его последнюю страницу. */
  signedOutByUser: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth() используется вне <AuthProvider>')
  return value
}

/** Профиль вошедшего пользователя; использовать внутри <RequireAuth>. */
export function useCurrentProfile(): Profile {
  const { profile } = useAuth()
  if (!profile) throw new Error('useCurrentProfile() используется вне <RequireAuth>')
  return profile
}
