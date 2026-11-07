import { Button, Result } from 'antd'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { FullPageSpin } from '../components/FullPageSpin.tsx'
import { errorMessage } from '../lib/errors.ts'
import { useAuth } from './AuthContext.ts'

/** Пускает дальше только вошедшего сотрудника с назначенной ролью. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.loading) return <FullPageSpin />

  if (!auth.session) {
    // После истёкшей сессии вернём на ту же страницу; после «Выйти» — нет:
    // следующий пользователь начнёт со своего стартового экрана.
    const state = auth.signedOutByUser ? undefined : { from: location.pathname + location.search }
    return <Navigate to="/login" replace state={state} />
  }

  if (auth.profileError) {
    return (
      <Result
        status="error"
        title="Не удалось загрузить профиль"
        subTitle={errorMessage(auth.profileError)}
        extra={<Button onClick={() => window.location.reload()}>Обновить страницу</Button>}
      />
    )
  }

  if (!auth.profile) {
    return (
      <Result
        status="403"
        title="Нет доступа"
        subTitle="Вашей учётной записи не назначена роль. Обратитесь к администратору."
        extra={<Button onClick={auth.signOut}>Выйти</Button>}
      />
    )
  }

  return children
}
