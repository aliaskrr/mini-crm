import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase.ts'
import { AuthContext, type AuthContextValue } from './AuthContext.ts'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // undefined — сессия ещё восстанавливается из localStorage
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [signedOutByUser, setSignedOutByUser] = useState(false)
  const lastUserId = useRef<string | null>(null)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const nextUserId = next?.user.id ?? null
      if (nextUserId !== lastUserId.current) {
        // Выход или вход под другим пользователем: сбрасываем кэш запросов,
        // чтобы данные прошлого пользователя не мелькнули следующему.
        queryClient.clear()
        lastUserId.current = nextUserId
      }
      if (next) setSignedOutByUser(false)
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const userId = session?.user.id

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const signOut = useCallback(async () => {
    setSignedOutByUser(true)
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const profile = profileQuery.data ?? null
    return {
      loading: session === undefined || (Boolean(userId) && profileQuery.isPending),
      session: session ?? null,
      profile,
      profileError: profileQuery.error,
      isManager: profile?.role === 'manager',
      signedOutByUser,
      signOut,
    }
  }, [session, userId, profileQuery.data, profileQuery.isPending, profileQuery.error, signedOutByUser, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
